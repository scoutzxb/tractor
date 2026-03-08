import { describe, test, expect } from 'bun:test';
import { followCardsStrategy, setCoverMode } from '../src/ai/play-strategy';
import type { Card, GameContext, Seat } from '../src/core/types';

const c = (suit: 'spade'|'heart'|'club'|'diamond', rank: any, id: number): Card => ({ id, suit, rank });

describe('play-strategy cover mode scope', () => {
  const seat: Seat = 'west';

  test('aggressive/conservative should be identical when cannot beat', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    const leadCards = [c('spade', 'A', 1)];
    const currentPlays = [{ seat: 'east' as Seat, cards: [c('spade', 'A', 11)] }];
    const hand = [c('spade', 'K', 2), c('spade', 'Q', 3), c('club', '5', 4)];

    setCoverMode('aggressive');
    const a = followCardsStrategy(hand, leadCards, currentPlays, seat, ctx);

    setCoverMode('conservative');
    const b = followCardsStrategy(hand, leadCards, currentPlays, seat, ctx);

    expect(a.map(x => x.id)).toEqual(b.map(x => x.id));
  });

  test('aggressive differs only when both can beat', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    const leadCards = [c('spade', 'Q', 1)];
    const currentPlays = [{ seat: 'east' as Seat, cards: [c('spade', 'Q', 11)] }];
    const hand = [c('spade', 'K', 2), c('spade', 'A', 3), c('club', '5', 4)];
    const mySeat: Seat = 'north';

    setCoverMode('aggressive');
    const a = followCardsStrategy(hand, leadCards, currentPlays, mySeat, ctx);

    setCoverMode('conservative');
    const b = followCardsStrategy(hand, leadCards, currentPlays, mySeat, ctx);

    expect(a[0].rank).toBe('A');
    expect(b[0].rank).toBe('K');
  });
});
