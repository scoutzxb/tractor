import type { Seat, Rank } from "../../src/core/types";
import type { TeamExemptions } from "../../src/core/scoring";
import { getLoggerManager, GameLogger } from "../game-logger";

export async function handleNewGame(req: Request, deps: any) {
  const { createGameEngine, SimpleAI, makeHumanProxy, id, sessions, summarize } = deps;
  const seats: Seat[] = ["east", "north", "west", "south"];

  const body = await req.json();
  const mode = body.mode === "grab" ? "grab" : "normal";
  const level = (["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as const).includes(body.level) ? body.level : "2";
  const dealer = seats.includes(body.dealer) ? body.dealer : "south";
  const playerMode = body.playerMode === 'two' ? 'two' : 'single'; // Default to single-player mode
  const isGrabMode = mode === "grab";

  const engine = createGameEngine(level, dealer, isGrabMode, Date.now());
  
  // Register players based on playerMode
  const humanSeats: Set<Seat> = new Set(playerMode === 'two' ? ['north', 'south'] : ['south']);
  
  // For single-player, register south as human, others as AI
  engine.registerPlayer(new SimpleAI("east", "东"));
  engine.registerPlayer(humanSeats.has("north") ? makeHumanProxy("north") : new SimpleAI("north", "北"));
  engine.registerPlayer(new SimpleAI("west", "西"));
  engine.registerPlayer(humanSeats.has("south") ? makeHumanProxy("south") : new SimpleAI("south", "南"));
  
  const deck = engine.prepareDeck();

  const scores = new Map<Seat, number>();
  for (const seat of seats) {
    scores.set(seat, 0);
  }

  // For multiplayer, start in "waiting" phase until both players join
  // For single-player, start dealing immediately
  const initialPhase = playerMode === 'two' ? "waiting" : "dealing";

  // Generate session ID first for logger
  const sessionId = id();
  
  const s = {
    id: sessionId,
    engine,
    deck,
    round: 0,
    done: false,
    phase: initialPhase,
    awaitingDiscard: false,
    pendingChaodiSettle: false,
    mode: isGrabMode ? "grab" : "normal",
    isGrabMode,
    configuredLevel: level,
    configuredDealer: dealer,
    humanSeats,
    playerMode,
    isMultiplayer: playerMode === 'two',
    teamLevels: { eastWest: level as Rank, northSouth: level as Rank },
    exemptions: { eastWest: [] as string[], northSouth: [] as string[] },
    lastLogIndex: 0,
    currentLeader: null as Seat | null,
    currentTrick: [] as Array<{ seat: Seat; cards: any[] }>,
    roundNumber: 0,
    scores,
    tricks: [] as any[],
    waitingNextRound: false,
    lastRoundReview: null as any,
    gameResult: null as any,
    logger: getLoggerManager("game-logs-web").startNewGame(sessionId),
    dealingCardsLog: [] as any[],
    players: new Map(), // Initialize empty players map for remote multiplayer
  };

  s.logger.setGrabMode(isGrabMode);
  
  sessions.set(s.id, s);
  deps.serverLog?.("new_game", { sessionId: s.id, mode, level, dealer, playerMode, isMultiplayer: playerMode === 'two', humanSeats: [...humanSeats] });
  return deps.json(summarize(s));
}
