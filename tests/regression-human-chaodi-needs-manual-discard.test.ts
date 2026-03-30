import { describe, expect, test } from 'bun:test';
import { handleChaoDiManual } from '../webapi/routes/run-chaodi';
import { handleDiscardManual } from '../webapi/routes/discard-manual';
import { getChaoDiOptions, summarize, json } from '../web-deal-service';
import { canChaoDi, chaoDi, createGameContext, declare, createTrumpState } from '../src/core/trump-state';
import type { Card, Seat } from '../src/core/types';

function levelCard(id: number, suit: 'spade' | 'heart' | 'club' | 'diamond', rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'): Card {
  return { id, suit, rank } as Card;
}

function makeReq(body: unknown, url = 'http://localhost/test') {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('regression: human chaodi must receive kitty and manually discard', () => {
  test('after human chaodi, kitty phase is shown and post-discard continues from next chaodi seat', async () => {
    const level = '2';
    const westSpadeSingle = [levelCard(1, 'spade', '2')];
    const southClubPair = [levelCard(2, 'club', '2'), levelCard(3, 'club', '2')];
    const kitty = [
      levelCard(100, 'diamond', '5'),
      levelCard(101, 'diamond', '6'),
      levelCard(102, 'diamond', '7'),
      levelCard(103, 'diamond', '8'),
      levelCard(104, 'diamond', '9'),
      levelCard(105, 'diamond', '10'),
    ];

    let trumpState = createTrumpState(false);
    trumpState = declare(trumpState, 'west', westSpadeSingle, level, 'north');
    trumpState = {
      ...trumpState,
      kittyHolder: 'north',
      phase: 'declared',
    };

    const state = {
      level,
      dealer: 'north' as Seat,
      trumpState,
      ctx: createGameContext(level, trumpState),
      kitty: [...kitty],
      hands: new Map<Seat, Card[]>([
        ['east', []],
        ['north', []],
        ['west', []],
        ['south', [
          ...southClubPair,
          levelCard(10, 'spade', 'A'),
          levelCard(11, 'spade', 'K'),
          levelCard(12, 'spade', 'Q'),
          levelCard(13, 'heart', 'A'),
          levelCard(14, 'heart', 'K'),
          levelCard(15, 'club', 'A'),
        ]],
      ]),
    };

    const session: any = {
      id: 'test-session',
      engine: {
        getState: () => state,
        getPlayer: () => null,
        getLogs: () => [],
      },
      humanSeats: new Set<Seat>(['south']),
      players: new Map(),
      phase: 'chaodi',
      awaitingDiscard: false,
      pendingChaodiSettle: false,
      dealerReceivedKitty: undefined,
      teamLevels: { eastWest: '2', northSouth: '2' },
      logger: null,
      currentLeader: null,
      currentTrick: [],
      roundNumber: 0,
      scores: new Map(),
      nextChaodiSeat: 'south' as Seat,
      chaodiRound: 1,
      chaodiPassCount: 0,
      tricks: [],
      waitingNextRound: false,
      lastRoundReview: null,
      gameResult: null,
    };

    const sessions = new Map([[session.id, session]]);
    const deps = { sessions, json, summarize, getChaoDiOptions, canChaoDi, chaoDi, createGameContext };

    const chaodiResp = await handleChaoDiManual(
      makeReq({ sessionId: session.id, playerSeat: 'south', key: getChaoDiOptions(session, 'south')[0].key }, 'http://localhost/api/chao-di'),
      deps,
    );
    const chaodiResult = await chaodiResp.json();

    expect(chaodiResp.status).toBe(200);
    expect((chaodiResult as any).ok).toBe(true);
    expect(session.phase).toBe('kitty');
    expect(session.awaitingDiscard).toBe(true);
    expect(session.pendingChaodiSettle).toBe(true);
    expect(state.kitty).toHaveLength(0);
    expect((state.hands.get('south') || []).length).toBe(14);
    expect((chaodiResult as any).state.phase).toBe('kitty');
    expect((chaodiResult as any).state.awaitingDiscard).toBe(true);
    expect((chaodiResult as any).state.kittyCards).toHaveLength(0);

    const discardIds = (state.hands.get('south') || []).slice(0, 6).map(c => c.id);
    const discardResp = await handleDiscardManual(
      makeReq({ sessionId: session.id, playerSeat: 'south', cardIds: discardIds }, 'http://localhost/api/discard-manual'),
      deps,
    );
    const discardResult = await discardResp.json();

    expect(discardResp.status).toBe(200);
    expect((discardResult as any).ok).toBe(true);
    expect(session.pendingChaodiSettle).toBe(false);
    expect(state.kitty).toHaveLength(6);
    expect((state.hands.get('south') || []).length).toBe(8);
    expect((discardResult as any).state.phase).not.toBe('kitty');
    expect((discardResult as any).state.awaitingDiscard).toBe(false);
    expect(state.trumpState.currentTrump?.declarer).toBe('south');
    expect(state.trumpState.currentTrump?.suit).toBe('club');
  });
});
