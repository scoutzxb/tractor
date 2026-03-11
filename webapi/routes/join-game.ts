import type { Seat } from "../../src/core/types";

export async function handleJoinGame(req: Request, deps: any) {
  const { sessions, json, generateToken, summarize } = deps;
  
  const body = await req.json();
  const { sessionId, desiredSeat, playerName } = body;
  
  // Validate seat
  const validSeats: Seat[] = ["north", "south"];
  if (!validSeats.includes(desiredSeat)) {
    return json({ error: "Invalid seat. Must be 'north' or 'south'" }, 400);
  }
  
  // Clean up old sessions for this player
  for (const [oldSessionId, oldSession] of sessions) {
    for (const [seat, player] of oldSession.players) {
      if (player.name === playerName && oldSessionId !== sessionId) {
        console.log(`[cleanup] Deleting old session ${oldSessionId} for player "${playerName}"`);
        sessions.delete(oldSessionId);
        break;
      }
    }
  }
  
  // Get session
  const session = sessions.get(sessionId);
  if (!session) {
    return json({ error: "Game session not found" }, 404);
  }
  
  // Check if seat is already taken
  if (session.players.has(desiredSeat)) {
    return json({ 
      error: `Seat ${desiredSeat} is already taken`,
      availableSeats: validSeats.filter(s => !session.players.has(s))
    }, 409);
  }
  
  // Check if this player is already registered for another seat
  for (const [seat, player] of session.players) {
    if (player.name === playerName) {
      return json({ 
        error: `Player "${playerName}" is already registered as ${seat}`,
        playerToken: player.token,
        playerSeat: seat
      }, 409);
    }
  }
  
  // Generate token and register player
  const token = generateToken();
  session.players.set(desiredSeat, {
    token,
    name: playerName,
    connectedAt: new Date(),
    lastSeen: new Date()
  });
  
  console.log(`Player "${playerName}" joined as ${desiredSeat} in session ${sessionId}`);
  
  // Return player info and game state
  return json({
    playerToken: token,
    playerSeat: desiredSeat,
    playerName,
    sessionId,
    gamePhase: session.phase,
    playerMode: session.playerMode,
    connectedPlayers: [...session.players.keys()],
    waitingFor: validSeats.filter(s => !session.players.has(s)),
    state: summarize(session, desiredSeat)
  });
}
