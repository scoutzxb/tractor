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
    // Human holds kitty - let them handle it
    s.phase = "kitty";
    s.awaitingDiscard = true;
  } else {
    // AI holds kitty - auto discard and proceed
    
    // Record what kitty holder received from kitty
    const stateBeforeDiscard = s.engine.getState();
    // In normal mode, dealer takes the kitty; in grab mode, the declarer takes it
    // Use dealer from state as the source of truth
    const kittyHolder = s.isGrabMode
      ? (stateAfterFinalize.trumpState.kittyHolder || stateBeforeDiscard.dealer)
      : stateBeforeDiscard.dealer;
    const kittyBefore = [...stateBeforeDiscard.kitty];
    
    s.engine.discardPhase();
    
    // Record final kitty and initial hands after AI auto-discard
    const stateAfterDiscard = s.engine.getState();
    
    // Calculate what kitty holder received (kitty cards now in hand)
    const receivedKitty = kittyBefore; // The kitty holder received the entire kitty
    
    // Calculate what kitty holder discarded (cards now in kitty)
    const discardedKitty = [...stateAfterDiscard.kitty];
    
    if (s.logger) {
      // Use the correct kitty holder (dealer in normal mode)
      s.logger.recordDealerKitty(kittyHolder, receivedKitty, discardedKitty);
    }
    
    if (s.logger && stateAfterDiscard.kitty) {
      s.logger.recordKitty(stateAfterDiscard.kitty);
    }
    
    if (s.logger && stateAfterDiscard.ctx) {
      s.logger.recordInitialHands(stateAfterDiscard.hands, stateAfterDiscard.ctx);
    }
    
    // IMPORTANT: Flush immediately after AI dealer takes kitty and puts cards back
    if (s.logger && stateAfterDiscard.ctx) {
      s.logger.flushToFile(stateAfterDiscard.ctx, stateAfterDiscard.dealer, { eastWest: stateAfterDiscard.level as Rank, northSouth: stateAfterDiscard.level as Rank });
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
