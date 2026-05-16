import { describe, expect, test } from 'bun:test';
import { createGameEngine } from '../src/engine/game-loop';
import { handlePostDealTick } from '../webapi/routes/post-deal-tick';
import {
  handleDeclareHuman,
  handlePlayHuman,
  makeHumanProxy,
  summarize,
  json,
} from '../web-deal-service';
import type { Card, Seat } from '../src/core/types';

function makeReq(body: unknown) {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createBaseSession(overrides: Record<string, any> = {}) {
  const engine = createGameEngine('2', 'south', true, 123);
  engine.registerPlayer(makeHumanProxy('south'));

  const session: any = {
    id: 'test-session',
    engine,
    deck: [],
    round: 0,
    done: false,
    phase: 'dealing',
    awaitingDiscard: false,
    pendingChaodiSettle: false,
    mode: 'grab',
    isGrabMode: true,
    configuredLevel: '2',
    configuredDealer: 'south',
    humanSeats: new Set<Seat>(['south']),
    playerMode: 'single',
    isMultiplayer: false,
    teamLevels: { eastWest: '2', northSouth: '2' },
    exemptions: { eastWest: [], northSouth: [] },
    lastLogIndex: 0,
    currentLeader: 'south',
    currentTrick: [],
    roundNumber: 0,
    scores: new Map<Seat, number>(),
    tricks: [],
    waitingNextRound: false,
    lastRoundReview: null,
    gameResult: null,
    logger: null,
    dealingCardsLog: [],
    players: new Map(),
    createdAt: Date.now(),
    ...overrides,
  };

  return session;
}

describe('regression: single-player generic routes', () => {
  test('handleDeclareHuman preserves request body and lets south declare when an option exists', async () => {
    const session = createBaseSession();
    const hand: Card[] = [
      { id: 1, suit: 'spade', rank: '2' },
      { id: 2, suit: 'spade', rank: '2' },
    ];
    session.engine.getState().hands.set('south', hand);

    const sessions = new Map([[session.id, session]]);
    const optionKey = 'south-s-spade-1';
    const response = await handleDeclareHuman(
      makeReq({ sessionId: session.id, playerSeat: 'south', key: optionKey }),
      { sessions, json, summarize, getDeclareOptions: (s: any, seat: Seat) => [{ key: optionKey, label: '单黑桃级牌', cards: [hand[0]] }] }
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).label).toBe('单黑桃级牌');
    expect((result as any).state.playerSeat).toBe('south');
    expect((result as any).state.trump?.declarer).toBe('south');
  });

  test('handlePlayHuman preserves request body and lets south play on turn', async () => {
    const session = createBaseSession({ phase: 'play', currentLeader: 'south' });
    const card: Card = { id: 11, suit: 'club', rank: '9' };
    const state = session.engine.getState();
    state.hands.set('south', [card]);
    state.ctx = { level: '2', trumpSuit: 'spade' };

    const sessions = new Map([[session.id, session]]);
    const response = await handlePlayHuman(
      makeReq({ sessionId: session.id, playerSeat: 'south', cardIds: [11] }),
      { sessions, json, summarize }
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).state.playerSeat).toBe('south');
    expect((result as any).state.myHand).toHaveLength(0);
  });

  test('single-player postDeal tick advances out of postDeal after timeout', async () => {
    const session = createBaseSession({
      phase: 'postDeal',
      postDealStartTime: Date.now() - 16000,
      deck: [],
    });
    const state = session.engine.getState();
    state.trumpState.currentTrump = {
      suit: 'spade',
      priority: 7,
      cards: [{ id: 50, suit: 'spade', rank: '2' }],
      declarer: 'south',
      level: '2',
    };
    state.trumpState.kittyHolder = 'south';
    state.kitty = [
      { id: 61, suit: 'heart', rank: '5' },
      { id: 62, suit: 'club', rank: '5' },
      { id: 63, suit: 'diamond', rank: '5' },
      { id: 64, suit: 'spade', rank: '5' },
      { id: 65, suit: 'heart', rank: '10' },
      { id: 66, suit: 'club', rank: '10' },
    ];
    state.hands.set('south', [
      { id: 71, suit: 'spade', rank: 'A' },
      { id: 72, suit: 'spade', rank: 'K' },
      { id: 73, suit: 'spade', rank: 'Q' },
      { id: 74, suit: 'spade', rank: 'J' },
      { id: 75, suit: 'heart', rank: 'A' },
      { id: 76, suit: 'club', rank: 'A' },
    ]);

    const sessions = new Map([[session.id, session]]);
    const response = await handlePostDealTick(
      makeReq({ sessionId: session.id, playerSeat: 'south' }),
      { sessions, summarize, json, serverLog: () => {} }
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect(['kitty', 'chaodi', 'play']).toContain((result as any).phase);
  });
});
