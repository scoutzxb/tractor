import { autoSaveForSeat } from "../autosave";

export async function handleTakeKitty(req: Request, deps: any) {
  const { sessions, json, summarize } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "kitty") return json({ error: "not in kitty phase" }, 400);
  
  const state = s.engine.getState();
  const kittyHolder = state.trumpState.kittyHolder;
  
  // Check if the requesting player is the kitty holder
  if (kittyHolder !== playerSeat) {
    return json({ error: "you are not kitty holder" }, 400);
  }
  
  // Add kitty cards to the player's hand
  const myHand = state.hands.get(playerSeat) || [];
  state.hands.set(playerSeat, [...myHand, ...state.kitty]);
  state.kitty = [];
  s.awaitingDiscard = true;
  autoSaveForSeat(s, playerSeat);
  
  return json({ ok: true, state: summarize(s, playerSeat) });
}
