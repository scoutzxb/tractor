export async function handleState(req: Request, deps: any) {
  const { sessions, summarize, json } = deps;
  const body = await req.json();
  const { sessionId, playerSeat } = body;
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  return json(summarize(s, playerSeat));
}
