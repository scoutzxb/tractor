import { describe, expect, test } from 'bun:test';
import { createGameEngine } from '../src/engine/game-loop';
import { SimpleAI } from '../src/ai/simple-player';
import { makeHumanProxy, json, summarize, handlePlayHuman } from '../web-deal-service';
import { handleNewGame } from '../webapi/routes/new-game';
import { handleJoinGame } from '../webapi/routes/join-game';
import { handleStartGame } from '../webapi/routes/start-game';
import type { Card, Seat } from '../src/core/types';

function req(body: unknown) {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildDeps() {
  const sessions = new Map<string, any>();
  let nextId = 1;
  let nextToken = 1;
  const deps: any = {
    createGameEngine,
    SimpleAI,
    makeHumanProxy,
    id: () => `mp-test-${nextId++}`,
    sessions,
    summarize,
    json,
    generateToken: () => `token-${nextToken++}`,
    requirePlayerAuth: (session: any, playerSeat?: Seat, playerToken?: string) => {
      if (!playerSeat) return 'missing player seat';
      if (!session.humanSeats.has(playerSeat)) return `${playerSeat} is not a human player`;
      const player = session.players.get(playerSeat);
      if (!player) return null;
      return player.token === playerToken ? null : 'invalid player token';
    },
    requireHost: (session: any, playerSeat?: Seat) => !session.hostSeat || session.hostSeat === playerSeat ? null : 'only the host can do this',
    serverLog: () => {},
  };
  return { deps, sessions };
}

describe('multiplayer regression fixes', () => {
  test('two-player start requires host token and rejects forged seat actions', async () => {
    const { deps } = buildDeps();
    const newGame = await (await handleNewGame(req({ mode: 'grab', level: '2', dealer: 'south', playerMode: 'two' }), deps)).json() as any;
    const south = await (await handleJoinGame(req({ sessionId: newGame.sessionId, desiredSeat: 'south', playerName: 'South' }), deps)).json() as any;
    const north = await (await handleJoinGame(req({ sessionId: newGame.sessionId, desiredSeat: 'north', playerName: 'North' }), deps)).json() as any;

    const nonHostStart = await handleStartGame(req({ sessionId: newGame.sessionId, playerSeat: 'north', playerToken: north.playerToken }), deps);
    expect(nonHostStart.status).toBe(403);

    const forgedStart = await handleStartGame(req({ sessionId: newGame.sessionId, playerSeat: 'south', playerToken: north.playerToken }), deps);
    expect(forgedStart.status).toBe(403);

    const hostStart = await handleStartGame(req({ sessionId: newGame.sessionId, playerSeat: 'south', playerToken: south.playerToken }), deps);
    const result = await hostStart.json() as any;
    expect(hostStart.status).toBe(200);
    expect(result.phase).toBe('dealing');
  });

  test('two-player human play rejects a wrong token and accepts the joined player token', async () => {
    const card: Card = { id: 1, suit: 'club', rank: '9' };
    const state = {
      level: '2',
      dealer: 'south' as Seat,
      trumpState: { currentTrump: null, kittyHolder: 'south' as Seat },
      ctx: { level: '2', trumpSuit: 'spade' },
      kitty: [] as Card[],
      hands: new Map<Seat, Card[]>([['south', [card]], ['north', []], ['east', []], ['west', []]]),
    };
    const session: any = {
      id: 'play-auth',
      engine: {
        getSerializableState: () => ({}),
        getState: () => state,
      },
      humanSeats: new Set<Seat>(['south', 'north']),
      players: new Map([['south', { token: 'south-token', name: 'South', connectedAt: new Date(), lastSeen: new Date() }]]),
      phase: 'play',
      currentLeader: 'south',
      currentTrick: [],
      scores: new Map<Seat, number>(),
      tricks: [],
      roundNumber: 0,
      waitingNextRound: false,
      lastRoundReview: null,
      gameResult: null,
      mode: 'grab',
      isGrabMode: true,
      configuredLevel: '2',
      configuredDealer: 'south',
      playerMode: 'two',
      isMultiplayer: true,
      awaitingDiscard: false,
      dealingCardsLog: [],
      logger: null,
      teamLevels: { eastWest: '2', northSouth: '2' },
    };
    const deps = {
      sessions: new Map([[session.id, session]]),
      json,
      summarize,
      requirePlayerAuth: (s: any, seat?: Seat, token?: string) => s.players.get(seat)?.token === token ? null : 'invalid player token',
    };

    const bad = await handlePlayHuman(req({ sessionId: session.id, playerSeat: 'south', playerToken: 'north-token', cardIds: [1] }), deps);
    expect(bad.status).toBe(403);

    const good = await handlePlayHuman(req({ sessionId: session.id, playerSeat: 'south', playerToken: 'south-token', cardIds: [1] }), deps);
    const result = await good.json() as any;
    expect(good.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.state.myHand).toHaveLength(0);
  });
});
