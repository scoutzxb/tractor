import { autoSaveForSeat } from "../autosave";

export async function handleDeclareManual(req: Request, deps: any) {
  const { sessions, getSouthDeclareOptions, json, summarize } = deps;
  const { sessionId, key, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  // 允许在dealing和postDeal阶段亮牌
  if (s.phase !== "dealing" && s.phase !== "postDeal") return json({ error: "not in dealing or postDeal phase" }, 400);
  const opts = getSouthDeclareOptions(s);
  const target = opts.find((o: any) => o.key === key);
  if (!target) return json({ error: "option not valid now" }, 400);
  const ok = s.engine.tryDeclare("south", target.cards);
  if (!ok) return json({ error: "declare rejected by engine" }, 400);
  autoSaveForSeat(s, playerSeat);
  return json({ ok: true, label: target.label, state: summarize(s, playerSeat) });
}
