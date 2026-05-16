import { autoSaveForSeat } from "../autosave";

export async function handleDeclareManual(req: Request, deps: any) {
  const { sessions, getDeclareOptions, json, summarize } = deps;
  const { sessionId, key, playerSeat, playerToken } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "dealing" && s.phase !== "postDeal") return json({ error: "not in dealing or postDeal phase" }, 400);
  if (!playerSeat || !s.humanSeats.has(playerSeat)) return json({ error: "invalid player seat" }, 400);
  const authError = deps.requirePlayerAuth?.(s, playerSeat, playerToken);
  if (authError) return json({ error: authError }, 403);
  const opts = getDeclareOptions(s, playerSeat);
  const target = opts.find((o: any) => o.key === key);
  if (!target) return json({ error: "option not valid now" }, 400);
  const ok = s.engine.tryDeclare(playerSeat, target.cards);
  if (!ok) return json({ error: "declare rejected by engine" }, 400);
  autoSaveForSeat(s, playerSeat);
  return json({ ok: true, label: target.label, state: summarize(s, playerSeat) });
}
