import type { Seat } from "../../src/core/types";
import { autoSaveForAllPlayers } from "../autosave";

// 发牌后等待阶段的tick处理
// 5秒后自动进入下一阶段（庄家拿底牌扣底牌）
const POST_DEAL_WAIT_MS = 5000;

export async function handlePostDealTick(req: Request, deps: any) {
  const { sessions, summarize, json } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "postDeal") return json({ error: "not in postDeal phase" }, 400);

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
  
  // Initialize play phase state on the session
  s.currentLeader = stateAfterFinalize.dealer;
  s.currentTrick = [];
  s.roundNumber = 0;

  // Check if kitty holder is a human player
  const kittyHolder = stateAfterFinalize.trumpState.kittyHolder;
  if (s.humanSeats.has(kittyHolder)) {
    // Human holds kitty - let them handle it
    s.phase = "kitty";
    s.awaitingDiscard = true;
  } else {
    // AI holds kitty - auto discard and proceed
    s.engine.discardPhase();
    
    // Record final kitty and initial hands after AI auto-discard
    const stateAfterDiscard = s.engine.getState();
    if (s.logger && stateAfterDiscard.kitty) {
      s.logger.recordKitty(stateAfterDiscard.kitty);
    }
    if (s.logger && stateAfterDiscard.ctx) {
      s.logger.recordInitialHands(stateAfterDiscard.hands, stateAfterDiscard.ctx);
    }
    
    s.currentLeader = s.engine.getState().dealer;
    s.phase = s.isGrabMode ? "play" : "chaodi";
    if (s.phase === "play") {
      s.currentTurn = s.currentLeader;
    }
  }

  deps.serverLog?.("postDeal_finished", {
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
