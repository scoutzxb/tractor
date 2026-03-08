export async function handleChaoDiManual(req: Request, deps: any) {
  const { sessions, json, summarize, getSouthChaoDiOptions, canChaoDi, chaoDi, createGameContext } = deps;
  const { sessionId, key, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  const opts = getSouthChaoDiOptions(s);
  const target = opts.find((o: any) => o.key === key);
  if (!target) return json({ error: "option not valid now" }, 400);

  const state = s.engine.getState();
  if (!canChaoDi(state.trumpState, "south", target.cards, state.level)) {
    return json({ error: "canChaoDi rejected by engine" }, 400);
  }

  // Save old kitty for logging
  const oldKitty = [...state.kitty];
  
  state.trumpState = chaoDi(state.trumpState, "south", target.cards, state.level);
  state.ctx = createGameContext(state.level, state.trumpState);

  const southHand = state.hands.get("south") || [];
  state.hands.set("south", [...southHand, ...state.kitty]);
  state.kitty = [];

  // Record chao-di event to logger
  if (s.logger) {
    s.logger.recordChaoDi(
      "south",
      target.cards,
      true, // success
      {
        suit: state.trumpState.currentTrump?.suit || null,
        isNoTrump: !state.trumpState.currentTrump?.suit
      },
      oldKitty, // received kitty
      [] // discarded kitty (will be recorded later in discard phase)
    );
  }

  // Fix: update lastLogIndex after successful chaodi
  s.lastLogIndex = s.engine.getLogs().length;

  s.phase = "kitty";
  s.awaitingDiscard = true;
  s.pendingChaodiSettle = true;

  return json({ ok: true, label: target.label, state: summarize(s, playerSeat) });
}
