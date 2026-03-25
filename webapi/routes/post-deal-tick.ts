import type { Seat } from "../../src/core/types";
import { autoSaveForAllPlayers } from "../autosave";
import {
  executeKittyProcess,
  advancePhaseAfterKitty,
} from "../kitty-utils";

// 发牌后等待阶段的tick处理
// 5秒后自动进入下一阶段（庄家拿底牌扣底牌）
const POST_DEAL_WAIT_MS = 5000;

export async function handlePostDealTick(req: Request, deps: any) {
  const { sessions, summarize, json, serverLog } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "postDeal") {
    return json({
      ok: true,
      phase: s.phase,
      remainingMs: 0,
      state: summarize(s, playerSeat)
    });
  }

  const elapsed = Date.now() - (s.postDealStartTime || 0);
  const remaining = Math.max(0, POST_DEAL_WAIT_MS - elapsed);

  // 如果还没到5秒，返回剩余时间
  if (remaining > 0) {
    return json({
      ok: true,
      phase: "postDeal",
      remainingMs: remaining,
      state: summarize(s, playerSeat)
    });
  }

  // 5秒已过，进入下一阶段
  s.engine.setKitty(s.deck);
  s.engine.finalizeTrumpPhase();
  s.done = true;

  const stateAfterFinalize = s.engine.getState();

  // Record kitty cards for logger
  if (s.logger && stateAfterFinalize.kitty) {
    s.logger.recordKitty(stateAfterFinalize.kitty);
  }

  // Record trump declaration for logger
  const trump = stateAfterFinalize.trumpState.currentTrump;
  if (s.logger && trump) {
    s.logger.recordTrump(
      trump.declarer!,
      trump.suit,
      trump.cards,
      !trump.suit
    );
  }

  // Flush trump/kitty phase to log file
  if (s.logger && stateAfterFinalize.ctx) {
    s.logger.flushToFile(stateAfterFinalize.ctx, stateAfterFinalize.dealer, { eastWest: stateAfterFinalize.level as Rank, northSouth: stateAfterFinalize.level as Rank });
  }

  // Initialize play phase state on the session
  s.currentLeader = stateAfterFinalize.dealer;
  s.currentTrick = [];
  s.roundNumber = 0;

  // Check if kitty holder is a human player
  const kittyHolder = stateAfterFinalize.trumpState.kittyHolder;
  if (s.humanSeats.has(kittyHolder)) {
    // Human holds kitty - let them handle it via take-kitty + discard-manual
    s.phase = "kitty";
    s.awaitingDiscard = true;
    s.dealerReceivedKitty = [...stateAfterFinalize.kitty]; // Store for logging
  } else {
    // AI holds kitty - use unified kitty process with AI discard strategy
    const state = s.engine.getState();

    const result = executeKittyProcess(s, kittyHolder, {
      type: "ai",
      ctx: state.ctx!,
      dealer: state.dealer,
    });

    if (!result.success) {
      console.error("AI kitty process failed:", result.error);
    }

    // Advance phase
    advancePhaseAfterKitty(s);
  }

  serverLog?.("postDeal_finished", {
    sessionId,
    phase: s.phase,
    dealer: s.engine.getState().dealer,
    kittyHolder: s.engine.getState().trumpState.kittyHolder,
  });

  autoSaveForAllPlayers(s);

  return json({
    ok: true,
    phase: s.phase,
    remainingMs: 0,
    state: summarize(s, playerSeat)
  });
}
