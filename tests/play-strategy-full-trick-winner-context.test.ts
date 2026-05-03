import { describe, expect, test } from 'bun:test';
import { followCardsStrategy, setCoverMode } from '../src/ai/play-strategy';
import { getWinningPlay } from '../src/core/trick-judge';
import { validateFollowPlay } from '../src/core/follow-validator';
import type { Card, GameContext, Seat } from '../src/core/types';

const c = (suit: 'spade' | 'heart' | 'club' | 'diamond', rank: string, id: number): Card => ({ id, suit, rank } as Card);
const j = (joker: 'big' | 'small', id: number): Card => ({ id, joker } as Card);

describe('AI跟牌使用完整当前轮上下文判断是否能赢', () => {
  test('敌方已用主杀副牌时，不应把同门大牌误判为能赢而浪费A', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    const leadCards = [c('spade', 'Q', 1)];
    const currentPlays = [
      { seat: 'east' as Seat, cards: leadCards },
      { seat: 'north' as Seat, cards: [j('small', 2)] }
    ];
    const hand: Card[] = [
      c('spade', 'A', 3),
      c('spade', '3', 4),
      c('club', '5', 5)
    ];

    setCoverMode('aggressive');
    const play = followCardsStrategy(hand, leadCards, currentPlays, 'west', ctx);

    expect(play.map(card => card.id)).toEqual([4]);
    expect(validateFollowPlay(play, leadCards, hand, ctx).valid).toBe(true);
    expect(getWinningPlay([...currentPlays, { seat: 'west' as Seat, cards: play }], ctx).seat).toBe('north');
  });

  test('搭档当前赢牌时，即使手里能压，也只按垫牌低损策略走', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    const leadCards = [c('spade', 'Q', 10)];
    const currentPlays = [
      { seat: 'east' as Seat, cards: leadCards },
      { seat: 'north' as Seat, cards: [c('spade', 'K', 11)] },
      { seat: 'west' as Seat, cards: [c('spade', '4', 15)] }
    ];
    const hand: Card[] = [
      c('spade', 'A', 12),
      c('spade', '3', 13),
      c('club', '5', 14)
    ];

    setCoverMode('aggressive');
    const play = followCardsStrategy(hand, leadCards, currentPlays, 'south', ctx);

    expect(play.map(card => card.id)).toEqual([13]);
    expect(validateFollowPlay(play, leadCards, hand, ctx).valid).toBe(true);
    expect(getWinningPlay([...currentPlays, { seat: 'south' as Seat, cards: play }], ctx).seat).toBe('north');
  });
});
