import { describe, expect, test } from 'bun:test';
import { handleNewGame } from '../webapi/routes/new-game';
import { handleJoinGame } from '../webapi/routes/join-game';
import { handleStartGame } from '../webapi/routes/start-game';
import { createGameEngine } from '../src/engine/game-loop';
import { SimpleAI } from '../src/ai/simple-player';
import type { Seat, Card } from '../src/core/types';

function makeRequest(body: unknown) {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeHumanProxy(seat: Seat = 'south') {
  return {
    seat,
    name: `${seat}-human`,
    chooseTrump: () => null,
    chooseChaoDi: () => null,
    discardKitty: (hand: Card[]) => hand.slice(0, 39),
    playCards: (hand: Card[]) => (hand.length ? [hand[0]] : []),
  };
}

function summarize(session: any, playerSeat?: Seat) {
  return {
    sessionId: session.id,
    phase: session.phase,
    playerMode: session.playerMode,
    humanSeats: [...session.humanSeats],
    connectedPlayers: [...session.players.keys()],
    playerSeat,
  };
}

function buildDeps() {
  const sessions = new Map<string, any>();
  let nextId = 1;
  let nextToken = 1;
  return {
    deps: {
      createGameEngine,
      SimpleAI,
      makeHumanProxy,
      id: () => `test-session-${nextId++}`,
      sessions,
      summarize,
      json,
      generateToken: () => `token-${nextToken++}`,
      serverLog: () => {},
    },
    sessions,
  };
}

describe('four-player remote lobby flow', () => {
  test('new four-player game starts in waiting phase with all four human seats', async () => {
    const { deps, sessions } = buildDeps();

    const response = await handleNewGame(
      makeRequest({ mode: 'grab', level: '2', dealer: 'south', playerMode: 'four' }),
      deps,
    );
    const result = await response.json() as any;
    const session = sessions.get(result.sessionId);

    expect(response.status).toBe(200);
    expect(result.phase).toBe('waiting');
    expect(result.humanSeats).toEqual(['east', 'north', 'west', 'south']);
    expect(session?.playerMode).toBe('four');
    expect([...((session?.humanSeats ?? new Set()) as Set<Seat>)]).toEqual(['east', 'north', 'west', 'south']);
  });

  test('four-player join flow tracks missing seats until all four have joined', async () => {
    const { deps } = buildDeps();

    const newGameResponse = await handleNewGame(
      makeRequest({ mode: 'grab', level: '2', dealer: 'south', playerMode: 'four' }),
      deps,
    );
    const newGame = await newGameResponse.json() as any;
    const sessionId = newGame.sessionId;

    const joinSouth = await (await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'south', playerName: 'A' }), deps)).json() as any;
    expect(joinSouth.waitingFor).toEqual(['east', 'north', 'west']);

    const joinEast = await (await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'east', playerName: 'B' }), deps)).json() as any;
    expect(joinEast.waitingFor).toEqual(['north', 'west']);

    const joinNorth = await (await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'north', playerName: 'C' }), deps)).json() as any;
    expect(joinNorth.waitingFor).toEqual(['west']);

    const joinWest = await (await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'west', playerName: 'D' }), deps)).json() as any;
    expect(joinWest.waitingFor).toEqual([]);
    expect(joinWest.connectedPlayers).toEqual(['south', 'east', 'north', 'west']);
  });

  test('start-game is rejected before all four players join, then succeeds after all seats are filled', async () => {
    const { deps, sessions } = buildDeps();

    const newGameResponse = await handleNewGame(
      makeRequest({ mode: 'grab', level: '2', dealer: 'south', playerMode: 'four' }),
      deps,
    );
    const newGame = await newGameResponse.json() as any;
    const sessionId = newGame.sessionId;

    await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'south', playerName: 'A' }), deps);
    await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'east', playerName: 'B' }), deps);
    await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'north', playerName: 'C' }), deps);

    const earlyStart = await handleStartGame(makeRequest({ sessionId, playerSeat: 'south' }), deps);
    const earlyResult = await earlyStart.json() as any;
    expect(earlyStart.status).toBe(400);
    expect(earlyResult.error).toBe('Not all players have joined yet');
    expect(earlyResult.waitingFor).toEqual(['west']);

    await handleJoinGame(makeRequest({ sessionId, desiredSeat: 'west', playerName: 'D' }), deps);

    const start = await handleStartGame(makeRequest({ sessionId, playerSeat: 'south' }), deps);
    const startResult = await start.json() as any;
    const session = sessions.get(sessionId);

    expect(start.status).toBe(200);
    expect(startResult.ok).toBe(true);
    expect(startResult.phase).toBe('dealing');
    expect(startResult.connectedPlayers).toEqual(['south', 'east', 'north', 'west']);
    expect(startResult.state.phase).toBe('dealing');
    expect(session?.phase).toBe('dealing');
  });
});
