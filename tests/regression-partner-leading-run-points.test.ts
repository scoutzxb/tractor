import { describe, expect, test } from 'bun:test';
import { followCardsStrategy } from '../src/ai/play-strategy';
import { getWinningPlay } from '../src/core/trick-judge';
import { validateFollowPlay } from '../src/core/follow-validator';
import type { Card, GameContext, Seat } from '../src/core/types';

const c = (suit: 'spade' | 'heart' | 'club' | 'diamond', rank: string, id: number): Card => ({ id, suit, rank } as Card);
const j = (joker: 'big' | 'small', id: number): Card => ({ id, joker } as Card);
const name = (card: Card): string => card.joker || `${card.suit}${card.rank}`;

describe('回归：搭档当前赢牌时跟牌应跑分', () => {
  const ctx: GameContext = { level: '3', trumpSuit: 'heart' };

  test('第9局第2轮：南家已经大，北家方块不够时应出分牌给南家', () => {
    const leadCards = [
      c('diamond', '10', 1), c('diamond', '2', 2), c('diamond', '2', 3),
      c('diamond', '10', 4), c('diamond', '2', 5), c('diamond', '10', 6),
    ];

    const northHandAfterRound1: Card[] = [
      j('big', 101), j('small', 102),
      c('club', '3', 103), c('diamond', '3', 104), c('diamond', '3', 105),
      c('heart', 'A', 106), c('heart', 'K', 107), c('heart', 'J', 108),
      c('heart', '8', 109), c('heart', '8', 110), c('heart', '7', 111), c('heart', '5', 112), c('heart', '4', 113),
      c('spade', 'K', 114), c('spade', 'J', 115), c('spade', 'J', 116), c('spade', '10', 117),
      c('spade', '9', 118), c('spade', '9', 119), c('spade', '7', 120), c('spade', '7', 121), c('spade', '5', 122), c('spade', '2', 123),
      c('club', 'K', 124), c('club', 'K', 125), c('club', '10', 126), c('club', '10', 127),
      c('club', '9', 128), c('club', '7', 129), c('club', '6', 130), c('club', '4', 131), c('club', '4', 132), c('club', '2', 133),
      c('diamond', 'J', 135),
    ];

    const currentPlays = [
      { seat: 'south' as Seat, cards: leadCards },
      { seat: 'east' as Seat, cards: [
        c('diamond', 'A', 201), c('spade', '4', 202), c('club', '6', 203),
        c('club', '9', 204), c('spade', 'Q', 205), c('club', 'A', 206),
      ] },
    ];

    expect(getWinningPlay(currentPlays, ctx).seat).toBe('south');

    const play = followCardsStrategy(northHandAfterRound1, leadCards, currentPlays, 'north', ctx);
    expect(validateFollowPlay(play, leadCards, northHandAfterRound1, ctx).valid).toBe(true);
    expect(play).toHaveLength(6);
    expect(play.filter(card => card.suit === 'diamond')).toHaveLength(1);
    expect(play.some(card => card.suit === 'club' && card.rank === '10')).toBe(true);
    expect(play.some(card => card.suit === 'spade' && card.rank === '10')).toBe(true);
    expect(play.reduce((sum, card) => sum + (card.rank === '5' ? 5 : card.rank === '10' || card.rank === 'K' ? 10 : 0), 0)).toBeGreaterThanOrEqual(40);
    expect(getWinningPlay([...currentPlays, { seat: 'north' as Seat, cards: play }], ctx).seat).toBe('south');
  });
});
