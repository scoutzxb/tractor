/**
 * Tractor Web Service - Two-Player Mode
 * 
 * Route handlers are in webapi/routes/
 * Frontend is in webapp/ (React + Vite)
 * Core engine and AI are in src/
 * 
 * Supports two human players: North and South
 */

import { serve } from "bun";
import { createGameEngine, type GameEngine } from "./src/engine/game-loop";
import { SimpleAI } from "./src/ai/simple-player";
import type { Card, Seat, Rank, Suit, GameContext } from "./src/core/types";
import { SUIT_NAMES, sortHand } from "./src/core/deck";
import { canDeclare, canChaoDi, chaoDi, createGameContext } from "./src/core/trump-state";
import { playOutHands } from "./src/engine/simulation";
import { leadCardsStrategy, followCardsStrategy, getWinningPlay, setCoverMode, setThrowLeadRate, setThrowRandomSource, setThrowSingleLevels } from "./src/ai/play-strategy";
import { getPartner, getDealerTeam, getPointCards, calculateResult, resolvePostRoundState, type TeamExemptions } from "./src/core/scoring";
import { seededRandom } from "./src/core/deck";
import { parseCards, getPlaySuit, classifyCard } from "./src/core/parser";
import { validateFollowPlay, autoCompleteFollow } from "./src/core/follow-validator";
import { validateLeadPlay } from "./src/core/lead-validator";
import { getWinningPlayDetailed } from "./src/core/trick-judge";
import { GameLogger, getLoggerManager } from "./webapi/game-logger";

// Import route handlers
import { handleNewGame } from "./webapi/routes/new-game";
import { handleJoinGame } from "./webapi/routes/join-game";
import { handleStartGame } from "./webapi/routes/start-game";
import { handleTick } from "./webapi/routes/tick";
import { handleState } from "./webapi/routes/state";
import { handleDeclareManual } from "./webapi/routes/declare-manual";
import { handleTakeKitty } from "./webapi/routes/take-kitty";
import { handleDiscardManual } from "./webapi/routes/discard-manual";
import { handleRunChaodi, handleChaoDiPass, handleChaoDiPassNorth } from "./webapi/routes/run-chaodi";
import { handleChaoDiManual } from "./webapi/routes/chao-di-manual";
import { handleSaveGame, handleListSaves, handleDeleteSave } from "./webapi/routes/save-game";
import { handleLoadGame, handleQuickLoad } from "./webapi/routes/load-game";
import { handlePostDealTick } from "./webapi/routes/post-deal-tick";
import { calculateGameResult } from "./src/engine/game-loop";

const seats: Seat[] = ["east", "north", "west", "south"];

// ============================================================================
// Types
// ============================================================================

type DeclareOption = {
  key: string;
  label: string;
  cards: Card[];
};

type ChaoDiOption = {
  key: string;
  label: string;
  cards: Card[];
};

export type Session = {
  id: string;
  engine: GameEngine;
  deck: Card[];
  round: number;
  done: boolean;
  phase: "waiting" | "dealing" | "postDeal" | "kitty" | "chaodi" | "play" | "done";
  postDealStartTime?: number;  // 发牌后等待开始时间（毫秒）
  awaitingDiscard: boolean;
  pendingChaodiSettle: boolean;
  mode: "grab" | "normal";
  isGrabMode: boolean;
  configuredLevel: Rank;
  configuredDealer: Seat;
  humanSeats: Set<Seat>;
  playerMode: 'single' | 'two';
  isMultiplayer: boolean;
  teamLevels: { eastWest: Rank; northSouth: Rank };
  exemptions: TeamExemptions;
  lastLogIndex: number;
  currentLeader: Seat | null;
  currentTrick: Array<{ seat: Seat; cards: Card[] }>;
  roundNumber: number;
  scores: Map<Seat, number>;
  tricks: Array<{
    round: number;
    leader: Seat;
    plays: Array<{ seat: Seat; cards: Card[] }>;
    winner: Seat;
    points: number;
    resolvedStructure?: any[];  // 用于甩牌时计算抠底倍数
  }>;
  waitingNextRound: boolean;
  lastRoundReview: {
    round: number;
    winner: Seat;
    points: number;
    plays: Array<{ seat: Seat; cards: Card[] }>;
  } | null;
  gameResult: {
    dealerTeamScore: number;
    defenderTeamScore: number;
    kittyScore: number;
    totalScore: number;
    winner: 'dealer' | 'defender';
    upgrade: number;
    nextDealer: Seat;
    nextLevel: Rank;
    nextMode: 'grab' | 'normal';
  } | null;
  logger: GameLogger;
  dealingCardsLog: Array<{ round: number; cardsBySeat: Map<Seat, Card>; declarations: Array<{ seat: Seat; cards: Card[] }> }>;
  
  // Player registration for remote multiplayer
  players: Map<Seat, {
    token: string;
    name: string;
    connectedAt: Date;
    lastSeen: Date;
  }>;
};

// Generate a simple token for player authentication
function generateToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ============================================================================
// Session Management
// ============================================================================

export const sessions = new Map<string, Session>();

export function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

// ============================================================================
// Human Player Proxy
// ============================================================================

export function makeHumanProxy(seat: Seat = "south") {
  return {
    seat,
    name: seat === "north" ? "North Player" : "South Player",
    chooseTrump: () => null,
    chooseChaoDi: () => null,
    discardKitty: (hand: Card[]) => hand.slice(0, 39),
    playCards: (hand: Card[]) => (hand.length ? [hand[0]] : []),
  };
}

// ============================================================================
// Declaration Order
// ============================================================================

export function declarationOrder(dealer: Seat): Seat[] {
  const i = seats.indexOf(dealer);
  return [seats[i], seats[(i + 1) % 4], seats[(i + 2) % 4], seats[(i + 3) % 4]];
}

// ============================================================================
// Card Display Helpers
// ============================================================================

function cardName(c: Card): string {
  if (!c) return "?";
  if (c.joker === "big") return "大王";
  if (c.joker === "small") return "小王";
  return `${SUIT_NAMES[c.suit!]}${c.rank}`;
}

function cardNames(cards: Card[]): string {
  return cards.map(cardName).join(" ");
}

function nextSeat(seat: Seat): Seat {
  // Counter-clockwise: east -> north -> west -> south -> east
  const order: Seat[] = ["east", "north", "west", "south"];
  const i = order.indexOf(seat);
  return order[(i + 1) % 4];
}

function getCardPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => {
    if (c.rank === '5') return sum + 5;
    if (c.rank === '10' || c.rank === 'K') return sum + 10;
    return sum;
  }, 0);
}

// ============================================================================
// Declare Options (for any player)
// ============================================================================

export function getDeclareOptions(session: Session, playerSeat: Seat): DeclareOption[] {
  const state = session.engine.getState();
  const hand = state.hands.get(playerSeat) || [];
  const level = state.level;

  const levelBySuit = new Map<Suit, Card[]>();
  for (const s of ["spade", "heart", "club", "diamond"] as Suit[]) levelBySuit.set(s, []);
  for (const c of hand) {
    if (!c.joker && c.rank === level && c.suit) levelBySuit.get(c.suit)!.push(c);
  }

  const options: DeclareOption[] = [];

  for (const suit of ["spade", "heart", "club", "diamond"] as Suit[]) {
    const cards = levelBySuit.get(suit)!;
    if (cards.length >= 1) options.push({ key: `${playerSeat}-s-${suit}-1`, label: `单${SUIT_NAMES[suit]}级牌`, cards: cards.slice(0, 1) });
    if (cards.length >= 2) options.push({ key: `${playerSeat}-s-${suit}-2`, label: `对${SUIT_NAMES[suit]}级牌`, cards: cards.slice(0, 2) });
    if (cards.length >= 3) options.push({ key: `${playerSeat}-s-${suit}-3`, label: `三${SUIT_NAMES[suit]}级牌`, cards: cards.slice(0, 3) });
  }

  const small = hand.filter((c) => c.joker === "small");
  const big = hand.filter((c) => c.joker === "big");
  if (small.length >= 2) options.push({ key: `${playerSeat}-j-small-2`, label: "对小王", cards: small.slice(0, 2) });
  if (small.length >= 3) options.push({ key: `${playerSeat}-j-small-3`, label: "三小王", cards: small.slice(0, 3) });
  if (big.length >= 2) options.push({ key: `${playerSeat}-j-big-2`, label: "对大王", cards: big.slice(0, 2) });
  if (big.length >= 3) options.push({ key: `${playerSeat}-j-big-3`, label: "三大王", cards: big.slice(0, 3) });

  return options.filter((o) => canDeclare(state.trumpState, playerSeat, o.cards, state.level, state.dealer));
}

// Backward compatibility
export function getSouthDeclareOptions(session: Session): DeclareOption[] {
  return getDeclareOptions(session, "south");
}

// ============================================================================
// ChaoDi Options (for any player)
// ============================================================================

export function getChaoDiOptions(session: Session, playerSeat: Seat): ChaoDiOption[] {
  const state = session.engine.getState();
  const hand = state.hands.get(playerSeat) || [];
  const level = state.level;
  const trump = state.trumpState.currentTrump;

  if (!trump) return [];

  const options: ChaoDiOption[] = [];

  // Check for stronger declarations
  const levelBySuit = new Map<Suit, Card[]>();
  for (const s of ["spade", "heart", "club", "diamond"] as Suit[]) levelBySuit.set(s, []);
  for (const c of hand) {
    if (!c.joker && c.rank === level && c.suit) levelBySuit.get(c.suit)!.push(c);
  }

  const small = hand.filter((c) => c.joker === "small");
  const big = hand.filter((c) => c.joker === "big");

  // Three big jokers (highest priority)
  if (big.length >= 3 && (!trump || trump.priority > 1)) {
    options.push({ key: `cd-${playerSeat}-big-3`, label: "三大王炒底", cards: big.slice(0, 3) });
  }

  // Three small jokers
  if (small.length >= 3 && (!trump || trump.priority > 2)) {
    options.push({ key: `cd-${playerSeat}-small-3`, label: "三小王炒底", cards: small.slice(0, 3) });
  }

  // Three same suit level cards
  for (const suit of ["spade", "heart", "club", "diamond"] as Suit[]) {
    const cards = levelBySuit.get(suit)!;
    if (cards.length >= 3 && (!trump || trump.priority > 3)) {
      options.push({ key: `cd-${playerSeat}-${suit}-3`, label: `三${SUIT_NAMES[suit]}级牌炒底`, cards: cards.slice(0, 3) });
    }
  }

  // Pair of big jokers (priority 4)
  if (big.length >= 2 && (!trump || trump.priority > 4)) {
    options.push({ key: `cd-${playerSeat}-big-2`, label: "对大王炒底", cards: big.slice(0, 2) });
  }

  // Pair of small jokers (priority 5)
  if (small.length >= 2 && (!trump || trump.priority > 5)) {
    options.push({ key: `cd-${playerSeat}-small-2`, label: "对小王炒底", cards: small.slice(0, 2) });
  }

  // Pair of same suit level cards (priority 6)
  for (const suit of ["spade", "heart", "club", "diamond"] as Suit[]) {
    const cards = levelBySuit.get(suit)!;
    if (cards.length >= 2 && (!trump || trump.priority > 6)) {
      options.push({ key: `cd-${playerSeat}-${suit}-2`, label: `对${SUIT_NAMES[suit]}级牌炒底`, cards: cards.slice(0, 2) });
    }
  }

  return options.filter((o) => canChaoDi(state.trumpState, playerSeat, o.cards, state.level));
}

// Backward compatibility
export function getSouthChaoDiOptions(session: Session): ChaoDiOption[] {
  return getChaoDiOptions(session, "south");
}

// ============================================================================
// Log Extraction
// ============================================================================

export function pullNewChaodiLogs(session: Session): string[] {
  const logs = session.engine.getLogs();
  const slice = logs.slice(session.lastLogIndex);
  session.lastLogIndex = logs.length;
  return slice
    .filter((l) => l.type === "chaoDi" || l.type === "trump" || l.type === "discard")
    .map((l) => l.message || l.type);
}

// ============================================================================
// Server Logging
// ============================================================================

export function serverLog(type: string, data: any) {
  console.log(`[${new Date().toISOString()}] [${type}]`, JSON.stringify(data));
}

// ============================================================================
// State Summarization (Two-Player Mode)
// ============================================================================

export function summarize(session: Session, playerSeat?: Seat) {
  const state = session.engine.getState();
  const trump = state.trumpState.currentTrump;
  
  // Determine the effective player seat for options
  // Backward compat: if no playerSeat specified, default to south
  const effectiveSeat = playerSeat || "south";
  
  // Get declare options for the requesting player
  const playerDeclareOptions = session.humanSeats.has(effectiveSeat)
    ? getDeclareOptions(session, effectiveSeat).map((o) => ({
        key: o.key,
        label: o.label,
        cards: o.cards.map((c) => c.id),
      }))
    : [];
  
  // Get chaodi options for the requesting player
  const playerChaoDiOptions = session.humanSeats.has(effectiveSeat)
    ? getChaoDiOptions(session, effectiveSeat).map((o) => ({
        key: o.key,
        label: o.label,
        cards: o.cards.map((c) => c.id),
      }))
    : [];

  const kittyHolder = state.trumpState.kittyHolder;
  // Only show kitty to its holder or during discard phase if it's the player's turn
  const showKitty = playerSeat === kittyHolder || (session.awaitingDiscard && playerSeat === kittyHolder);

  // Calculate defender scores
  const partner: Record<string, string> = { east: "west", west: "east", north: "south", south: "north" };
  const dealerTeam = state.dealer ? new Set([state.dealer, partner[state.dealer]]) : new Set<string>();
  const defenderSeats = seats.filter((s) => !dealerTeam.has(s));
  const defenderTotal = defenderSeats.reduce((sum, s) => sum + (session.scores.get(s) || 0), 0);

  // Collect defender point cards
  const defenderPointCards: Card[] = [];
  for (const trick of session.tricks) {
    if (defenderSeats.includes(trick.winner)) {
      for (const play of trick.plays) {
        defenderPointCards.push(...play.cards.filter(c => c.rank === '5' || c.rank === '10' || c.rank === 'K'));
      }
    }
  }

  // Build table plays
  const tablePlays: Record<string, Card[]> = {
    east: [],
    north: [],
    west: [],
    south: [],
  };

  for (const play of session.currentTrick) {
    tablePlays[play.seat] = play.cards;
  }

  // Determine current turn
  let currentTurn: Seat | null = null;
  if (session.phase === "play" && !session.waitingNextRound) {
    if (session.currentTrick.length < 4) {
      if (session.currentTrick.length === 0) {
        currentTurn = session.currentLeader;
      } else {
        currentTurn = nextSeat(session.currentTrick[session.currentTrick.length - 1].seat);
      }
    }
  }

  // Filter hand based on playerSeat
  let myHand: Card[] = [];
  if (playerSeat && session.humanSeats.has(playerSeat)) {
    myHand = state.hands.get(playerSeat) || [];
  } else if (!playerSeat) {
    // Backward compatibility: show south hand if no playerSeat specified
    myHand = state.hands.get("south") || [];
  }

  return {
    sessionId: session.id,
    round: session.round,
    mode: session.mode,
    isGrabMode: session.isGrabMode,
    configuredLevel: session.configuredLevel,
    configuredDealer: session.configuredDealer,
    latestPhase: session.phase,
    phase: session.phase,
    level: state.level,
    dealer: state.dealer,
    trump: trump
      ? {
          declarer: trump.declarer,
          suit: trump.suit,
          suitName: trump.suit ? SUIT_NAMES[trump.suit] : "无主",
          cardsCount: trump.cards.length,
        }
      : null,
    kittyHolder,
    kittyCount: state.kitty.length,
    kittyCards: showKitty ? state.kitty : [],
    awaitingDiscard: session.awaitingDiscard,
    handCounts: Object.fromEntries(seats.map((s) => [s, (state.hands.get(s) || []).length])),
    // Seat-specific hand
    myHand,
    playerSeat, // Tell the client which seat they are
    humanSeats: [...session.humanSeats],
    connectedPlayers: [...session.players.keys()],
    // Seat-specific options
    declareOptions: (session.phase === "dealing" || session.phase === "postDeal") ? playerDeclareOptions : [],
    chaoDiOptions: session.phase === "chaodi" ? playerChaoDiOptions : [],
    done: session.done,
    currentTurn,
    waitingNextRound: session.waitingNextRound,
    lastRoundReview: session.lastRoundReview,
    scores: Object.fromEntries(seats.map((s) => [s, session.scores.get(s) || 0])),
    defenderTotal,
    defenderPointCards,
    capturedPointCardsBySeat: Object.fromEntries(seats.map(s => [s, [] as Card[]])),
    tablePlays,
    roundNumber: session.roundNumber,
    gameResult: session.gameResult,
    isMultiplayer: session.isMultiplayer,
  };
}

// ============================================================================
// Dependencies Object
// ============================================================================

const deps = {
  createGameEngine,
  SimpleAI,
  makeHumanProxy,
  id,
  sessions,
  summarize,
  json,
  declarationOrder,
  getDeclareOptions,
  getChaoDiOptions,
  getSouthDeclareOptions,
  getSouthChaoDiOptions,
  pullNewChaodiLogs,
  canChaoDi,
  chaoDi,
  createGameContext,
  SUIT_NAMES,
  serverLog,
  generateToken,
  seats,
};

// ============================================================================
// HTML Index
// ============================================================================

function htmlIndex(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Tractor Game - Two Player Mode</title>
  <style>
    body { font-family: ui-sans-serif, system-ui; background: #0a0a0a; color: #f4f4f5; padding: 16px; }
    .panel { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 12px; margin: 10px 0; }
    .small { color: #a1a1aa; font-size: 12px; }
    button { padding: 8px 12px; border-radius: 8px; border: 1px solid #3f3f46; background: #18181b; color: #fafafa; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button:hover:not(:disabled) { background: #27272a; }
    h2 { margin-bottom: 8px; }
    code { background: #27272a; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h2>🚜 Tractor Game - Two Player Mode</h2>
  <div class="panel">
    <p class="small">Two human players: North and South. East and West are AI.</p>
    <p class="small">Build frontend: <code>cd webapp && bun run build</code></p>
  </div>
  <div class="panel">
    <p><strong>Available API Endpoints:</strong></p>
    <ul class="small">
      <li>POST /api/new-game - Start a new game (two-player mode)</li>
      <li>POST /api/join-game - Join an existing game</li>
      <li>POST /api/start-game - Start the game</li>
      <li>POST /api/tick - Deal one round</li>
      <li>POST /api/state - Get current state</li>
      <li>POST /api/declare-manual - South player declaration</li>
      <li>POST /api/declare-north - North player declaration</li>
      <li>POST /api/take-kitty - Take the kitty</li>
      <li>POST /api/discard-manual - South player discard</li>
      <li>POST /api/discard-north - North player discard</li>
      <li>POST /api/run-chaodi - Run chaodi phase</li>
      <li>POST /api/chao-di-manual - South player chaodi</li>
      <li>POST /api/chao-di-north - North player chaodi</li>
      <li>POST /api/chao-di-pass - South player pass chaodi</li>
      <li>POST /api/chao-di-pass-north - North player pass chaodi</li>
      <li>POST /api/run-play - Run AI play phase</li>
      <li>POST /api/play-human - South player's card play</li>
      <li>POST /api/play-north - North player's card play</li>
      <li>POST /api/next-round - Advance to next round</li>
      <li>POST /api/next-game - Start a new game</li>
      <li>POST /api/advance-play - Auto-advance AI players</li>
    </ul>
  </div>
  <div class="panel">
    <p class="small">Server running on port ${process.env.PORT || 8787}</p>
  </div>
</body>
</html>`;
}

// ============================================================================
// Static File Serving
// ============================================================================

async function serveStatic(path: string): Promise<Response | null> {
  const distPath = `${import.meta.dir}/webapp/dist${path === "/" ? "/index.html" : path}`;
  const file = Bun.file(distPath);
  if (await file.exists()) {
    return new Response(file);
  }
  return null;
}

// ============================================================================
// Game Result Calculation
// ============================================================================

function calculateGameResult(session: Session): Session['gameResult'] {
  const state = session.engine.getState();
  const dealer = state.dealer;
  
  const partner = getPartner(dealer);
  let dealerTeamScore = 0;
  let defenderTeamScore = 0;
  
  session.scores.forEach((score, seat) => {
    if (seat === dealer || seat === partner) {
      dealerTeamScore += score;
    } else {
      defenderTeamScore += score;
    }
  });
  
  const lastWinner = session.tricks.length > 0 ? session.tricks[session.tricks.length - 1].winner : null;
  const lastWinnerTeam = lastWinner ? (lastWinner === dealer || lastWinner === partner ? 'defense' : 'attack') : 'defense';
  
  // 获取最后一轮赢家出的牌（用于计算抠底倍数）
  const lastTrick = session.tricks.length > 0 ? session.tricks[session.tricks.length - 1] : null;
  const lastWinnerCards = lastTrick && lastWinner 
    ? (lastTrick.plays.find(p => p.seat === lastWinner)?.cards || []) 
    : [];
  const lastResolvedStructure = lastTrick?.resolvedStructure;
  
  const scoringCtx = {
    level: state.level,
    trumpSuit: state.trumpState.currentTrump?.suit || null,
    dealer: dealer,
    teamLevels: session.teamLevels
  };
  
  const result = calculateResult(
    defenderTeamScore,
    state.kitty,
    lastWinnerTeam,
    lastWinnerCards,
    scoringCtx,
    lastResolvedStructure  // 传递 resolvedStructure 用于甩牌抠底计算
  );
  
  const winner = result.totalScore <= 115 ? 'dealer' : 'defender';
  
  const postRoundState = resolvePostRoundState(
    result,
    dealer,
    session.teamLevels,
    session.exemptions
  );
  
  session.teamLevels = postRoundState.nextTeamLevels;
  session.exemptions = postRoundState.nextExemptions;
  
  const nextMode = session.isGrabMode ? 'normal' : session.mode;
  const nextDealerTeam = getDealerTeam(postRoundState.nextDealer);
  const nextLevel = nextDealerTeam === 'eastWest' 
    ? postRoundState.nextTeamLevels.eastWest 
    : postRoundState.nextTeamLevels.northSouth;
  
  console.log('Game ended with next settings:', {
    nextDealer: postRoundState.nextDealer,
    nextLevel,
    nextMode
  });
  
  return {
    dealerTeamScore,
    defenderTeamScore,
    kittyScore: result.kittyScore,
    totalScore: result.totalScore,
    winner,
    upgrade: Math.abs(result.defenseUpgrade) + Math.abs(result.dealerUpgrade),
    nextDealer: postRoundState.nextDealer,
    nextLevel,
    nextMode
  };
}

// ============================================================================
// Save Game Log
// ============================================================================

function saveGameLog(session: Session): string | null {
  if (!session.logger) return null;
  
  const state = session.engine.getState();
  const dealer = state.dealer;
  
  // 保存当前局的级别（在 calculateGameResult 更新之前）
  const currentTeamLevels = { ...session.teamLevels };
  
  for (const trick of session.tricks) {
    session.logger.recordTrick(trick);
  }
  
  session.logger.recordFinalScores(session.scores);
  
  if (session.gameResult) {
    // 计算底牌原始分数
    const kittyBaseScore = getPointCards(state.kitty);
    // 计算抠底倍数
    const kittyScore = session.gameResult.kittyScore;
    const kittyMultiplier = kittyBaseScore > 0 && kittyScore > 0 
      ? Math.floor(kittyScore / kittyBaseScore) 
      : 1;
    // 是否抠底
    const isKittyTaken = kittyScore > 0;
    
    session.logger.recordGameResult({
      dealerTeamScore: session.gameResult.dealerTeamScore,
      defenderTeamScore: session.gameResult.defenderTeamScore,
      kittyBaseScore,
      kittyMultiplier,
      kittyScore,
      isKittyTaken,
      totalScore: session.gameResult.totalScore,
      winner: session.gameResult.winner,
      nextDealer: session.gameResult.nextDealer,
      nextLevel: session.gameResult.nextLevel,
    });
  }
  
  const filepath = session.logger.saveLog(
    state.dealer,
    currentTeamLevels,  // 使用保存的当前局级别
    state.ctx
  );
  
  console.log(`Game log saved to: ${filepath}`);
  return filepath;
}

// ============================================================================
// Initialize Session for Play Phase
// ============================================================================

function initPlayPhase(session: Session): void {
  const state = session.engine.getState();
  session.currentLeader = state.dealer;
  session.currentTrick = [];
  session.roundNumber = 0;
  session.scores = new Map(seats.map(s => [s, 0]));
  session.tricks = [];
  session.waitingNextRound = false;
  session.lastRoundReview = null;
  session.gameResult = null;
}

// ============================================================================
// Play Phase Handlers
// ============================================================================

async function handleRunPlay(req: Request, deps: any): Promise<Response> {
  const { sessions, json, summarize } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "play") return json({ error: "not in play phase" }, 400);

  const logs: string[] = [];
  const state = s.engine.getState();
  
  if (s.scores.size === 0) {
    initPlayPhase(s);
  }
  
  setCoverMode('aggressive');
  setThrowLeadRate(0.5);
  setThrowSingleLevels(1);
  setThrowRandomSource(Math.random);

  const simResult = playOutHands({
    seats,
    dealer: state.dealer,
    level: state.level,
    teamLevels: { eastWest: '2', northSouth: '2' },
    ctx: state.ctx!,
    kitty: state.kitty,
    hands: state.hands,
    strictValidation: false,
    leadStrategy: leadCardsStrategy,
    followStrategy: followCardsStrategy
  });

  s.tricks = simResult.tricks;
  s.scores = simResult.scores;
  s.roundNumber = simResult.tricks.length;
  
  for (const trick of simResult.tricks) {
    logs.push(`第${trick.round}轮: ${trick.plays.map(p => `${p.seat}:${cardNames(p.cards)}`).join(' | ')} => ${trick.winner}胜(${trick.roundScore}分)`);
  }

  s.gameResult = calculateGameResult(s);

  logs.push(`游戏结束: 庄家方${s.gameResult.dealerTeamScore}分, 防家方${s.gameResult.defenderTeamScore}分`);
  logs.push(s.gameResult.winner === 'dealer' ? '庄家方获胜!' : '防家方获胜!');

  s.phase = "done";
  saveGameLog(s);

  return json({ ok: true, logs, state: summarize(s) });
}

// Generic play handler for any human player
async function handlePlayGeneric(req: Request, deps: any, playerSeat: Seat): Promise<Response> {
  const { sessions, json, summarize } = deps;
  const { sessionId, cardIds } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "play") return json({ error: "not in play phase" }, 400);
  if (!s.humanSeats.has(playerSeat)) return json({ error: `${playerSeat} is not a human player` }, 400);

  const state = s.engine.getState();
  
  if (s.scores.size === 0) {
    initPlayPhase(s);
  }

  // Determine whose turn it is
  let currentTurn: Seat;
  if (s.currentTrick.length === 0) {
    currentTurn = s.currentLeader!;
  } else {
    currentTurn = nextSeat(s.currentTrick[s.currentTrick.length - 1].seat);
  }

  if (currentTurn !== playerSeat) {
    return json({ error: "not your turn", currentTurn }, 400);
  }

  const hand = state.hands.get(playerSeat) || [];
  const idSet = new Set(cardIds.map((x: any) => Number(x)));
  const cards = hand.filter((c: Card) => idSet.has(c.id));

  if (cards.length === 0) {
    return json({ error: "no valid cards selected" }, 400);
  }

  const events: string[] = [];

  // Validate the play
  if (s.currentTrick.length === 0) {
    // Leading
    const otherHands = seats.filter(s => s !== playerSeat).map(s => state.hands.get(s) || []);
    const validation = validateLeadPlay(cards, otherHands as any, state.ctx!);
    
    if (!validation.valid && validation.failedComponent) {
      events.push(`甩牌失败: ${validation.reason || '结构被压制'}`);
      const attemptedCards = leadCardsStrategy(hand, state.ctx!);
      cards.length = 0;
      cards.push(...validation.failedComponent.cards);
      events.push(`${playerSeat}尝试出牌: ${cardNames(attemptedCards)} → 失败，改出: ${cardNames(cards)}`);
    }
  } else {
    // Following
    const leadCards = s.currentTrick[0].cards;
    const validation = validateFollowPlay(cards, leadCards, hand, state.ctx!);
    
    if (!validation.valid) {
      const autoCards = autoCompleteFollow([], leadCards, hand, state.ctx!);
      events.push(`跟牌自动修正: ${validation.reason || 'invalid play'}`);
      cards.length = 0;
      cards.push(...autoCards);
    }
  }

  events.push(`${playerSeat}出牌: ${cardNames(cards)}`);

  const remaining = hand.filter((c: Card) => !cards.includes(c));
  state.hands.set(playerSeat, remaining);
  
  s.currentTrick.push({ seat: playerSeat, cards });

  let winner: Seat | null = null;
  let points = 0;

  if (s.currentTrick.length >= 4) {
    const trickResult = getWinningPlayDetailed(s.currentTrick, state.ctx!);
    winner = trickResult.winner.seat;
    points = getCardPoints(s.currentTrick.flatMap(p => p.cards));
    
    s.scores.set(winner, (s.scores.get(winner) || 0) + points);
    s.roundNumber++;
    
    events.push(`本轮胜者: ${winner}，得分: ${points}`);
    
    s.tricks.push({
      round: s.roundNumber,
      leader: s.currentLeader!,
      plays: [...s.currentTrick],
      winner,
      points,
      resolvedStructure: trickResult.resolvedStructure
    });

    s.lastRoundReview = {
      round: s.roundNumber,
      winner,
      points,
      plays: [...s.currentTrick]
    };
    
    s.currentLeader = winner;
    s.currentTrick = [];
    s.waitingNextRound = true;

    const totalRemaining = Array.from(state.hands.values()).reduce((sum, h) => sum + h.length, 0);
    if (totalRemaining === 0) {
      s.phase = "done";
      s.gameResult = calculateGameResult(s);
      saveGameLog(s);
      events.push("游戏结束!");
    }
  }

  return json({ ok: true, events, winner, points, state: summarize(s, playerSeat) });
}

async function handlePlayHuman(req: Request, deps: any): Promise<Response> {
  return handlePlayGeneric(req, deps, "south");
}

async function handlePlayNorth(req: Request, deps: any): Promise<Response> {
  return handlePlayGeneric(req, deps, "north");
}

async function handleNextRound(req: Request, deps: any): Promise<Response> {
  const { sessions, json, summarize } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "play") return json({ error: "not in play phase" }, 400);

  s.waitingNextRound = false;

  const state = s.engine.getState();
  
  const totalCards = Array.from(state.hands.values()).reduce((sum: number, h: Card[]) => sum + h.length, 0);
  if (totalCards === 0) {
    s.phase = "done";
    s.gameResult = calculateGameResult(s);
    saveGameLog(s);
    return json({ ok: true, events: ["游戏结束"], state: summarize(s, playerSeat) });
  }

  return json({ ok: true, events: [], state: summarize(s, playerSeat) });
}

async function handleNextGame(req: Request, deps: any): Promise<Response> {
  const { sessions, json, createGameEngine, SimpleAI, makeHumanProxy, id, summarize } = deps;
  const { sessionId, mode, level, dealer, playerMode, playerSeat } = await req.json();
  const oldSession = sessions.get(sessionId);
  
  // Determine game settings
  let isGrabMode: boolean;
  let newLevel: Rank;
  let newDealer: Seat;
  let newTeamLevels: { eastWest: Rank; northSouth: Rank };
  let newExemptions: TeamExemptions;
  
  if (oldSession && oldSession.gameResult) {
    const result = oldSession.gameResult;
    isGrabMode = result.nextMode === 'grab';
    newLevel = result.nextLevel;
    newDealer = result.nextDealer;
    newTeamLevels = oldSession.teamLevels;
    newExemptions = oldSession.exemptions;
  } else {
    isGrabMode = mode === 'grab';
    newLevel = level || '2';
    newDealer = dealer || 'south';
    newTeamLevels = { eastWest: '2', northSouth: '2' };
    newExemptions = { eastWest: [], northSouth: [] };
  }

  const oldSessionPlayerMode = oldSession?.playerMode;
  const playerM = playerMode || oldSessionPlayerMode;
  const actualPlayerMode = playerM || 'single';
  const engine = createGameEngine(newLevel, newDealer, isGrabMode, Date.now());
  
  // Register players based on mode
  // Default: two-player mode (north and south are human)
  const humanSeats: Set<Seat> = new Set(actualPlayerMode === 'single' ? ['south'] : ['north', 'south']);
  
  engine.registerPlayer(new SimpleAI("east", "东"));
  engine.registerPlayer(humanSeats.has("north") ? makeHumanProxy("north") : new SimpleAI("north", "北"));
  engine.registerPlayer(new SimpleAI("west", "西"));
  engine.registerPlayer(humanSeats.has("south") ? makeHumanProxy("south") : new SimpleAI("south", "南"));
  
  const deck = engine.prepareDeck();

  const newSessionId = id();
  
  const s: Session = {
    id: newSessionId,
    engine,
    deck,
    round: 0,
    done: false,
    phase: "dealing",
    awaitingDiscard: false,
    pendingChaodiSettle: false,
    mode: isGrabMode ? "grab" : "normal",
    isGrabMode,
    configuredLevel: newLevel,
    configuredDealer: newDealer,
    humanSeats,
    playerMode: actualPlayerMode,
    teamLevels: newTeamLevels,
    exemptions: newExemptions,
    lastLogIndex: 0,
    currentLeader: null,
    currentTrick: [],
    roundNumber: 0,
    scores: new Map(),
    tricks: [],
    waitingNextRound: false,
    lastRoundReview: null,
    gameResult: null,
    logger: getLoggerManager("game-logs-web").startNewGame(newSessionId),
    dealingCardsLog: [],
    players: new Map(), // Will be populated below for two-player mode
  };

  s.logger.setGrabMode(isGrabMode);

  // For two-player mode, transfer players from old session
  if (actualPlayerMode === 'two' && oldSession && oldSession.players.size > 0) {
    // Copy player info from old session
    for (const [seat, player] of oldSession.players) {
      s.players.set(seat, {
        ...player,
        connectedAt: new Date(),
        lastSeen: new Date()
      });
      // Re-register human player
      s.engine.registerPlayer(makeHumanProxy(seat));
    }
    // Both players are already connected, go directly to dealing
    s.phase = "dealing";
  }

  sessions.set(s.id, s);
  
  if (oldSession) {
    sessions.delete(sessionId);
  }

  return json(summarize(s, playerSeat));
}

async function handleAdvancePlay(req: Request, deps: any): Promise<Response> {
  const { sessions, json, summarize } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "play") return json({ ok: true, events: [], state: summarize(s, playerSeat) });

  const events: string[] = [];
  const state = s.engine.getState();

  if (s.waitingNextRound) {
    return json({ ok: true, events: [], state: summarize(s, playerSeat) });
  }

  if (!s.currentLeader) {
    s.currentLeader = state.dealer;
    s.currentTrick = [];
    s.roundNumber = 0;
  }

  let currentTurn: Seat;
  if (s.currentTrick.length === 0) {
    currentTurn = s.currentLeader;
  } else {
    currentTurn = nextSeat(s.currentTrick[s.currentTrick.length - 1].seat);
  }

  // If it's a human player's turn, wait for them
  if (s.humanSeats.has(currentTurn)) {
    return json({ ok: true, events: [], state: summarize(s, playerSeat) });
  }

  // AI plays
  const ai = s.engine.getPlayer(currentTurn);
  const hand = state.hands.get(currentTurn) || [];
  
  let cards: Card[];
  if (s.currentTrick.length === 0) {
    const attemptedCards = leadCardsStrategy(hand, state.ctx!);
    cards = attemptedCards;
    
    const otherHands = seats.filter(s => s !== currentTurn).map(s => state.hands.get(s) || []);
    const validation = validateLeadPlay(cards, otherHands as any, state.ctx!);
    
    if (!validation.valid && validation.failedComponent) {
      cards = [...validation.failedComponent.cards];
      events.push(`${currentTurn} 尝试甩牌: ${cardNames(attemptedCards)} → 失败，改出: ${cardNames(cards)}`);
    }
  } else {
    cards = followCardsStrategy(hand, s.currentTrick[0].cards, s.currentTrick, currentTurn, state.ctx!);
  }
  
  if (cards.length > 0) {
    const remaining = hand.filter((c: Card) => !cards.includes(c));
    state.hands.set(currentTurn, remaining);
    s.currentTrick.push({ seat: currentTurn, cards });
    events.push(`${currentTurn} 出牌: ${cardNames(cards)}`);
    
    if (s.currentTrick.length >= 4) {
      const trickResult = getWinningPlayDetailed(s.currentTrick, state.ctx!);
      const winner = trickResult.winner.seat;
      const points = getCardPoints(s.currentTrick.flatMap(p => p.cards));
      
      s.scores.set(winner, (s.scores.get(winner) || 0) + points);
      s.roundNumber++;
      
      events.push(`本轮胜者: ${winner}，得分: ${points}`);
      
      s.tricks.push({
        round: s.roundNumber,
        leader: s.currentLeader!,
        plays: [...s.currentTrick],
        winner,
        points,
        resolvedStructure: trickResult.resolvedStructure
      });

      s.lastRoundReview = {
        round: s.roundNumber,
        winner,
        points,
        plays: [...s.currentTrick]
      };
      
      s.currentLeader = winner;
      s.currentTrick = [];
      s.waitingNextRound = true;

      const totalRemaining = Array.from(state.hands.values()).reduce((sum, h) => sum + h.length, 0);
      if (totalRemaining === 0) {
        s.phase = "done";
        s.gameResult = calculateGameResult(s);
        saveGameLog(s);
        events.push("游戏结束!");
      }
    }
  }

  return json({ ok: true, events, state: summarize(s, playerSeat) });
}

// ============================================================================
// Declaration Handlers (for both players)
// ============================================================================

async function handleDeclareGeneric(req: Request, deps: any, playerSeat: Seat): Promise<Response> {
  const { sessions, json, summarize, getDeclareOptions } = deps;
  const { sessionId, key } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  // 允许在dealing和postDeal阶段亮牌
  if (s.phase !== "dealing" && s.phase !== "postDeal") return json({ error: "not in dealing or postDeal phase" }, 400);
  if (!s.humanSeats.has(playerSeat)) return json({ error: `${playerSeat} is not a human player` }, 400);

  const options = getDeclareOptions(s, playerSeat);
  const option = options.find((o: any) => o.key === key);
  if (!option) return json({ error: "invalid declare option" }, 400);

  const state = s.engine.getState();
  const success = s.engine.tryDeclare(playerSeat, option.cards);
  
  if (!success) {
    return json({ error: "declaration failed" }, 400);
  }

  return json({ ok: true, label: option.label, state: summarize(s, playerSeat) });
}

async function handleDeclareNorth(req: Request, deps: any): Promise<Response> {
  return handleDeclareGeneric(req, deps, "north");
}

// ============================================================================
// ChaoDi Handlers (for both players)
// ============================================================================

async function handleChaoDiGeneric(req: Request, deps: any, playerSeat: Seat): Promise<Response> {
  const { sessions, json, summarize, getChaoDiOptions, chaoDi, createGameContext } = deps;
  const { sessionId, key } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);
  if (!s.humanSeats.has(playerSeat)) return json({ error: `${playerSeat} is not a human player` }, 400);

  const options = getChaoDiOptions(s, playerSeat);
  const option = options.find((o: any) => o.key === key);
  if (!option) return json({ error: "invalid chaodi option" }, 400);

  const state = s.engine.getState();
  
  // Save old kitty for logging
  const oldKitty = [...state.kitty];
  
  // Perform chaodi
  state.trumpState = chaoDi(state.trumpState, playerSeat, option.cards, state.level);
  state.ctx = createGameContext(state.level, state.trumpState);
  
  // Give kitty to player
  const hand = state.hands.get(playerSeat) || [];
  const newHand = [...hand, ...state.kitty];
  
  // Remove cards used for chaodi
  const chaodiCardIds = new Set(option.cards.map(c => c.id));
  const filteredHand = newHand.filter(c => !chaodiCardIds.has(c.id));
  
  // Auto-discard: keep 39 cards, put rest back as kitty
  const discardedKitty = filteredHand.slice(39);
  state.hands.set(playerSeat, filteredHand.slice(0, 39));
  state.kitty = discardedKitty;
  
  // Record chao-di event to logger
  if (s.logger) {
    s.logger.recordChaoDi(
      playerSeat,
      option.cards,
      true, // success
      {
        suit: state.trumpState.currentTrump?.suit || null,
        isNoTrump: !state.trumpState.currentTrump?.suit
      },
      oldKitty, // received kitty
      discardedKitty // discarded kitty
    );
  }
  
  // Record initial hands after auto-discard
  if (s.logger && state.ctx) {
    s.logger.recordInitialHands(state.hands, state.ctx);
  }
  
  s.engine.log && s.engine.log('chaoDi', `${playerSeat} 炒底成功`, {
    cards: option.cards.map((c: Card) => c.joker ? c.joker : `${c.suit}${c.rank}`),
    newTrump: state.trumpState.currentTrump,
  });

  return json({ ok: true, label: option.label, state: summarize(s, playerSeat) });
}

async function handleChaoDiNorth(req: Request, deps: any): Promise<Response> {
  return handleChaoDiGeneric(req, deps, "north");
}

// ============================================================================
// Discard Handlers (for both players)
// ============================================================================

async function handleDiscardGeneric(req: Request, deps: any, playerSeat: Seat): Promise<Response> {
  const { sessions, json, summarize } = deps;
  const { sessionId, cardIds } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "kitty") return json({ error: "not in kitty phase" }, 400);
  
  const state = s.engine.getState();
  
  // Only the kitty holder can discard
  if (state.trumpState.kittyHolder !== playerSeat) {
    return json({ error: "not the kitty holder" }, 400);
  }
  
  if (!s.humanSeats.has(playerSeat)) {
    return json({ error: `${playerSeat} is not a human player` }, 400);
  }

  const hand = state.hands.get(playerSeat) || [];
  const idSet = new Set(cardIds.map((x: any) => Number(x)));
  const toDiscard = hand.filter((c: Card) => idSet.has(c.id));

  if (toDiscard.length !== 6) {
    return json({ error: "must discard exactly 6 cards" }, 400);
  }

  const remaining = hand.filter((c: Card) => !idSet.has(c.id));
  state.hands.set(playerSeat, remaining);
  state.kitty = toDiscard;
  
  s.awaitingDiscard = false;
  s.phase = "chaodi";

  return json({ ok: true, state: summarize(s, playerSeat) });
}

async function handleDiscardNorth(req: Request, deps: any): Promise<Response> {
  return handleDiscardGeneric(req, deps, "north");
}

// ============================================================================
// Request Handler
// ============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (url.pathname === "/" || url.pathname.startsWith("/assets/")) {
    const staticResponse = await serveStatic(url.pathname);
    if (staticResponse) return staticResponse;
  }

  // API Routes
  if (url.pathname === "/api/new-game" && req.method === "POST") {
    return handleNewGame(req, deps);
  }

  if (url.pathname === "/api/join-game" && req.method === "POST") {
    return handleJoinGame(req, deps);
  }

  if (url.pathname === "/api/start-game" && req.method === "POST") {
    return handleStartGame(req, deps);
  }

  if (url.pathname === "/api/tick" && req.method === "POST") {
    return handleTick(req, deps);
  }

  if (url.pathname === "/api/state" && req.method === "POST") {
    return handleState(req, deps);
  }

  if (url.pathname === "/api/declare-manual" && req.method === "POST") {
    return handleDeclareManual(req, deps);
  }
  
  // North player declaration
  if (url.pathname === "/api/declare-north" && req.method === "POST") {
    return handleDeclareNorth(req, deps);
  }

  if (url.pathname === "/api/take-kitty" && req.method === "POST") {
    return handleTakeKitty(req, deps);
  }

  if (url.pathname === "/api/discard-manual" && req.method === "POST") {
    return handleDiscardManual(req, deps);
  }
  
  // North player discard
  if (url.pathname === "/api/discard-north" && req.method === "POST") {
    return handleDiscardNorth(req, deps);
  }

  if (url.pathname === "/api/run-chaodi" && req.method === "POST") {
    return handleRunChaodi(req, deps);
  }

  if (url.pathname === "/api/chao-di-manual" && req.method === "POST") {
    return handleChaoDiManual(req, deps);
  }
  
  // North player chaodi
  if (url.pathname === "/api/chao-di-north" && req.method === "POST") {
    return handleChaoDiNorth(req, deps);
  }

  // South player pass chaodi
  if (url.pathname === "/api/chao-di-pass" && req.method === "POST") {
    return handleChaoDiPass(req, deps);
  }

  // North player pass chaodi
  if (url.pathname === "/api/chao-di-pass-north" && req.method === "POST") {
    return handleChaoDiPassNorth(req, deps);
  }

  if (url.pathname === "/api/run-play" && req.method === "POST") {
    return handleRunPlay(req, deps);
  }

  if (url.pathname === "/api/play-human" && req.method === "POST") {
    return handlePlayHuman(req, deps);
  }
  
  // North player play
  if (url.pathname === "/api/play-north" && req.method === "POST") {
    return handlePlayNorth(req, deps);
  }

  if (url.pathname === "/api/next-round" && req.method === "POST") {
    return handleNextRound(req, deps);
  }

  if (url.pathname === "/api/next-game" && req.method === "POST") {
    return handleNextGame(req, deps);
  }

  if (url.pathname === "/api/advance-play" && req.method === "POST") {
    return handleAdvancePlay(req, deps);
  }

  // Post-deal tick (5 second wait after dealing)
  if (url.pathname === "/api/post-deal-tick" && req.method === "POST") {
    return handlePostDealTick(req, deps);
  }

  // Save/Load routes
  if (url.pathname === "/api/save-game" && req.method === "POST") {
    return handleSaveGame(req, deps);
  }

  if (url.pathname === "/api/load-game" && req.method === "POST") {
    return handleLoadGame(req, deps);
  }

  if (url.pathname === "/api/list-saves" && req.method === "POST") {
    return handleListSaves(req, deps);
  }

  if (url.pathname === "/api/delete-save" && req.method === "POST") {
    return handleDeleteSave(req, deps);
  }

  if (url.pathname === "/api/quick-load" && req.method === "POST") {
    return handleQuickLoad(req, deps);
  }

  if (url.pathname === "/") {
    return new Response(htmlIndex(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return json({ error: "not found" }, 404);
}

// ============================================================================
// Start Server
// ============================================================================

const port = Number(process.env.PORT || 8787);

serve({
  port,
  fetch: handleRequest,
});

console.log(`🚀 Tractor web service running on port ${port}`);
console.log(`   Two-player mode: North and South are human players`);
console.log(`   API endpoints available at /api/*`);
console.log(`   React frontend: cd webapp && bun run build`);
