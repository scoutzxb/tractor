import { describe, expect, test } from 'bun:test';
import { handleDiscardHuman, json, summarize, makeHumanProxy } from '../web-deal-service';
import { createGameEngine } from '../src/engine/game-loop';
import type { Card, Seat } from '../src/core/types';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/discard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('regression: discard route absorbs kitty if take-kitty was skipped', () => {
  test('dealer stays at 39 cards after discard even if /api/discard arrives before /api/take-kitty', async () => {
    const engine = createGameEngine('5', 'south', false, 123);
    engine.registerPlayer(makeHumanProxy('south'));

    const state = engine.getState();
    state.dealer = 'south';
    state.trumpState.kittyHolder = 'south';
    state.ctx = { level: '5', trumpSuit: 'heart' } as any;

    const southHand: Card[] = Array.from({ length: 39 }, (_, i) => ({
      id: i + 1,
      suit: 'spade',
      rank: 'A',
    })) as Card[];
    const kitty: Card[] = Array.from({ length: 6 }, (_, i) => ({
      id: 100 + i,
      suit: 'club',
      rank: '2',
    })) as Card[];

    state.hands.set('south', southHand);
    state.hands.set('east', []);
    state.hands.set('north', []);
    state.hands.set('west', []);
    state.kitty = kitty;

    const session: any = {
      id: 'test-session',
      engine,
      deck: [],
      round: 0,
      done: true,
      phase: 'kitty',
      awaitingDiscard: true,
      pendingChaodiSettle: false,
      dealerReceivedKitty: undefined,
      mode: 'normal',
      isGrabMode: false,
      configuredLevel: '5',
      configuredDealer: 'south',
      humanSeats: new Set<Seat>(['south']),
      playerMode: 'single',
      isMultiplayer: false,
      teamLevels: { eastWest: '2', northSouth: '5' },
      exemptions: { eastWest: [], northSouth: [] },
      lastLogIndex: 0,
      currentLeader: null,
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
    };

    const sessions = new Map([[session.id, session]]);
    const discardIds = kitty.map((c) => c.id);

    const response = await handleDiscardHuman(
      makeReq({ sessionId: session.id, playerSeat: 'south', cardIds: discardIds }),
      {
        sessions,
        json,
        summarize,
        getChaoDiOptions: () => [],
        canChaoDi: () => false,
        chaoDi: () => state.trumpState,
        createGameContext: () => state.ctx,
        processChaodiPolling: () => ({ type: 'finished', logs: [] }),
      }
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect(state.hands.get('south')).toHaveLength(39);
    expect(state.kitty).toHaveLength(6);
    expect(session.dealerReceivedKitty?.map((c: Card) => c.id) ?? kitty.map((c) => c.id)).toEqual(kitty.map((c) => c.id));
    expect((result as any).state.handCounts.south).toBe(39);
  });
});
