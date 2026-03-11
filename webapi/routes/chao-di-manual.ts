import { autoSaveForSeat } from "../autosave";

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
  
  // Perform chaodi (update trump state)
  state.trumpState = chaoDi(state.trumpState, "south", target.cards, state.level);
  state.ctx = createGameContext(state.level, state.trumpState);

  // Give kitty to player and remove chaodi cards
  const southHand = state.hands.get("south") || [];
  const newHand = [...southHand, ...state.kitty];
  
  // Remove chaodi cards from hand
  const chaodiCardIds = new Set(target.cards.map((c: any) => c.id));
  const filteredHand = newHand.filter((c: any) => !chaodiCardIds.has(c.id));
  
  // Auto-discard: keep 39 cards, put rest back as kitty
  const discardedKitty = filteredHand.slice(39);
  state.hands.set("south", filteredHand.slice(0, 39));
  state.kitty = discardedKitty;

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
      discardedKitty // discarded kitty (now properly recorded)
    );
  }

  // Fix: update lastLogIndex after successful chaodi
  s.lastLogIndex = s.engine.getLogs().length;

  s.phase = "kitty";
  s.awaitingDiscard = true;
  s.pendingChaodiSettle = true;
  autoSaveForSeat(s, playerSeat);

  return json({ ok: true, label: target.label, state: summarize(s, playerSeat) });
}
