import type { Seat } from "../../src/core/types";

export async function handleStartGame(req: Request, deps: any) {
  const { sessions, json, summarize, makeHumanProxy } = deps;

  const body = await req.json();
  const { sessionId, playerSeat } = body;

  const session = sessions.get(sessionId);
  if (!session) {
    return json({ error: "Game session not found" }, 404);
  }

  if (session.phase !== "waiting") {
    return json({ error: "Game is not in waiting phase" }, 400);
  }

  const requiredSeats = [...session.humanSeats];
  const joinedSeats = [...session.players.keys()];

  const allJoined = requiredSeats.every(seat => joinedSeats.includes(seat));

  if (!allJoined) {
    return json({
      error: "Not all players have joined yet",
      requiredSeats,
      joinedSeats,
      waitingFor: requiredSeats.filter(s => !joinedSeats.includes(s))
    }, 400);
  }

  for (const [seat, player] of session.players) {
    session.engine.registerPlayer(makeHumanProxy(seat));
    console.log(`Registered player "${player.name}" as ${seat}`);
  }

  session.phase = "dealing";

  console.log(`Game ${sessionId} started with players: ${joinedSeats.join(", ")}`);

  return json({
    ok: true,
    message: "Game started!",
    phase: session.phase,
    connectedPlayers: joinedSeats,
    state: summarize(session, playerSeat)
  });
}
