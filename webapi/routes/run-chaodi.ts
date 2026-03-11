import type { Seat, Card } from "../../src/core/types";
import { autoSaveForAllPlayers, autoSaveForSeat } from "../autosave";

const SEATS: Seat[] = ["east", "north", "west", "south"];

function getNextSeat(seat: Seat): Seat {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

function initChaodiPolling(s: any): void {
  const state = s.engine.getState();
  const startSeat = getNextSeat(state.trumpState.kittyHolder || state.dealer);
  s.chaodiRound = 1;
  s.nextChaodiSeat = startSeat;
  s.chaodiPassCount = 0;
}

// ============================================================================
// Unified Chaodi Execution - Handles the core logic for ALL players
// ============================================================================

function executeChaoDi(
  s: any,
  playerSeat: Seat,
  chaodiCards: Card[],
  deps: any
): { success: boolean; error?: string; logs?: string[] } {
  const { chaoDi, createGameContext } = deps;
  const state = s.engine.getState();
  const logs: string[] = [];

  // Save old kitty for logging
  const oldKitty = [...state.kitty];

  // Perform chaodi (update trump state)
  state.trumpState = chaoDi(state.trumpState, playerSeat, chaodiCards, state.level);
  state.ctx = createGameContext(state.level, state.trumpState);

  // Give kitty to player and remove chaodi cards
  const hand = state.hands.get(playerSeat) || [];
  const newHand = [...hand, ...state.kitty];

  // Remove chaodi cards from hand
  const chaodiCardIds = new Set(chaodiCards.map((c: any) => c.id));
  const filteredHand = newHand.filter((c: any) => !chaodiCardIds.has(c.id));

  // Auto-discard: keep 39 cards, put rest back as kitty
  const discardedKitty = filteredHand.slice(39);
  state.hands.set(playerSeat, filteredHand.slice(0, 39));
  state.kitty = discardedKitty;

  logs.push(`${playerSeat} 炒底成功`);
  logs.push(`${playerSeat} 自动扣底完成`);

  // Record chao-di event to logger
  if (s.logger) {
    s.logger.recordChaoDi(
      playerSeat,
      chaodiCards,
      true,
      {
        suit: state.trumpState.currentTrump?.suit || null,
        isNoTrump: !state.trumpState.currentTrump?.suit
      },
      oldKitty,
      discardedKitty
    );
  }

  // Continue to next chaodi round
  s.nextChaodiSeat = getNextSeat(playerSeat);
  s.chaodiPassCount = 0;

  return { success: true, logs };
}

// ============================================================================
// API Handlers
// ============================================================================

export async function handleChaoDiManual(req: Request, deps: any) {
  const { sessions, json, summarize, getChaoDiOptions, canChaoDi, chaoDi, createGameContext } = deps;
  const { sessionId, key, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  const opts = getChaoDiOptions(s, playerSeat);
  const target = opts.find((o: any) => o.key === key);
  if (!target) return json({ error: "option not valid now" }, 400);

  const state = s.engine.getState();
  if (!canChaoDi(state.trumpState, playerSeat, target.cards, state.level)) {
    return json({ error: "canChaoDi rejected by engine" }, 400);
  }

  // Execute chaodi using unified function
  const result = executeChaoDi(s, playerSeat, target.cards, { chaoDi, createGameContext });
  if (!result.success) {
    return json({ error: result.error || "chaodi failed" }, 400);
  }

  // Update log index
  s.lastLogIndex = s.engine.getLogs().length;

  // Set phase to kitty for human player to see their new hand
  s.phase = "kitty";
  s.awaitingDiscard = false; // Already auto-discarded by unified function
  s.pendingChaodiSettle = true;
  autoSaveForSeat(s, playerSeat);

  return json({ ok: true, label: target.label, logs: result.logs, state: summarize(s, playerSeat) });
}

export async function handleRunChaodi(req: Request, deps: any) {
  const { sessions, json, summarize, getChaoDiOptions, canChaoDi, chaoDi, createGameContext } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  if (!s.nextChaodiSeat) {
    initChaodiPolling(s);
  }

  const logs: string[] = [];
  const state = s.engine.getState();
  let currentSeat: Seat = s.nextChaodiSeat;
  let processedCount = 0;

  while (processedCount < 4) {
    if (state.trumpState.currentTrump?.declarer === currentSeat) {
      currentSeat = getNextSeat(currentSeat);
      processedCount++;
      continue;
    }

    if (state.trumpState.kittyHolder === currentSeat) {
      currentSeat = getNextSeat(currentSeat);
      processedCount++;
      continue;
    }

    const options = getChaoDiOptions(s, currentSeat);
    if (options.length === 0) {
      currentSeat = getNextSeat(currentSeat);
      processedCount++;
      continue;
    }

    // Human player: stop and wait for their decision
    if (s.humanSeats.has(currentSeat)) {
      s.nextChaodiSeat = currentSeat;
      autoSaveForSeat(s, currentSeat);
      return json({
        ok: true,
        logs,
        waitingForHuman: true,
        humanSeat: currentSeat,
        state: summarize(s, playerSeat)
      });
    }

    // AI player: make decision and execute chaodi
    const aiPlayer = s.engine.getPlayer(currentSeat);
    if (aiPlayer) {
      const hand = state.hands.get(currentSeat) || [];
      const chaodiCards = aiPlayer.chooseChaoDi(hand, state.level, state.trumpState);

      if (chaodiCards && chaodiCards.length > 0) {
        // Check if can chaodi
        if (!canChaoDi(state.trumpState, currentSeat, chaodiCards, state.level)) {
          currentSeat = getNextSeat(currentSeat);
          processedCount++;
          continue;
        }

        // Execute chaodi using unified function
        const result = executeChaoDi(s, currentSeat, chaodiCards, { chaoDi, createGameContext });
        if (result.success) {
          logs.push(...(result.logs || []));
          // Continue loop - don't return, process next player
          currentSeat = s.nextChaodiSeat;
          processedCount = 0; // Reset to process full round
          continue;
        }
      }
    }

    currentSeat = getNextSeat(currentSeat);
    processedCount++;
  }

  // Round complete - no one chaodi'd, end chaodi phase
  s.currentLeader = state.dealer;
  s.currentTrick = [];
  s.roundNumber = 0;
  s.scores = new Map([["east", 0], ["north", 0], ["west", 0], ["south", 0]]);
  s.phase = "play";

  if (s.logger && state.ctx) {
    s.logger.recordInitialHands(state.hands, state.ctx);
  }

  autoSaveForAllPlayers(s);

  return json({
    ok: true,
    logs: [...logs, "炒底阶段结束，进入出牌阶段"],
    state: summarize(s, playerSeat)
  });
}

export async function handleChaoDiPass(req: Request, deps: any) {
  const { sessions, json, summarize, getChaoDiOptions } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  const options = getChaoDiOptions(s, playerSeat);
  if (options.length === 0) {
    return json({ error: "you cannot chaodi now" }, 400);
  }

  s.chaodiPassCount = (s.chaodiPassCount || 0) + 1;
  s.nextChaodiSeat = getNextSeat(playerSeat);

  const state = s.engine.getState();
  if (s.chaodiPassCount >= 3) {
    s.currentLeader = state.dealer;
    s.currentTrick = [];
    s.roundNumber = 0;
    s.scores = new Map([["east", 0], ["north", 0], ["west", 0], ["south", 0]]);
    s.phase = "play";

    if (s.logger && state.ctx) {
      s.logger.recordInitialHands(state.hands, state.ctx);
    }

    autoSaveForAllPlayers(s);

    return json({
      ok: true,
      passed: true,
      message: "炒底阶段结束，进入出牌阶段",
      state: summarize(s, playerSeat)
    });
  }

  autoSaveForAllPlayers(s);

  return json({
    ok: true,
    passed: true,
    message: "已跳过，继续轮询其他玩家",
    state: summarize(s, playerSeat)
  });
}

export async function handleChaoDiPassNorth(req: Request, deps: any) {
  return handleChaoDiPass(req, { ...deps, playerSeat: 'north' });
}
