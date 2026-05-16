export async function handleState(req: Request, deps: any) {
  const { sessions, summarize, json } = deps;
  const body = await req.json();
  const { sessionId, playerSeat, playerToken } = body;
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  const authError = deps.requirePlayerAuth?.(s, playerSeat, playerToken);
  if (authError) return json({ error: authError }, 403);
  return json(summarize(s, playerSeat));
}
