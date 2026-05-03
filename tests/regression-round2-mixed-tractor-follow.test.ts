import { describe, expect, test } from 'bun:test';
import { autoCompleteFollow, validateFollowPlay } from '../src/core/follow-validator';
import { followCardsStrategy } from '../src/ai/play-strategy';
import { enumerateCards } from '../src/core/parser-enumerate';
import type { Card, GameContext, Seat } from '../src/core/types';

const c = (suit: 'spade' | 'heart' | 'club' | 'diamond', rank: string, id: number): Card => ({ id, suit, rank } as Card);
const club = (rank: string, id: number): Card => c('club', rank, id);

function hasClub3344(cards: Card[], ctx: GameContext): boolean {
  return enumerateCards(cards, ctx).tractors.some(chain => {
    const ranks = chain.flatMap(component => component.cards.map(card => card.rank)).sort();
    return ranks.join(',') === '3,3,4,4';
  });
}

describe('回归：甩牌含拖拉机时必须优先跟拖拉机', () => {
  const ctx: GameContext = { level: '2', trumpSuit: null };

  const leadCards = [
    club('6', 1), club('6', 2),
    club('5', 3), club('5', 4),
    club('A', 5),
  ];

  const southHand: Card[] = [
    c('spade', 'A', 101), c('spade', 'Q', 102), c('spade', '8', 103), c('spade', '5', 104),
    c('spade', '3', 105), c('spade', '3', 106), c('spade', '3', 107),
    c('heart', 'A', 108), c('heart', 'K', 109), c('heart', 'Q', 110), c('heart', 'Q', 111),
    c('heart', 'J', 112), c('heart', '9', 113), c('heart', '6', 114), c('heart', '4', 115), c('heart', '4', 116),
    club('K', 117), club('Q', 118), club('J', 119), club('9', 120), club('9', 121), club('8', 122),
    club('7', 123), club('7', 124), club('4', 125), club('4', 126), club('4', 127), club('3', 128), club('3', 129),
    c('diamond', 'J', 130), c('diamond', '10', 131), c('diamond', '8', 132), c('diamond', '3', 133),
    c('spade', '2', 134), c('heart', '2', 135), club('2', 136), club('2', 137),
  ];

  test('原日志中南家 77899 跟牌应判非法，因为手里有 3344 拖拉机', () => {
    const loggedIllegalPlay = [club('7', 123), club('8', 122), club('7', 124), club('9', 120), club('9', 121)];
    const result = validateFollowPlay(loggedIllegalPlay, leadCards, southHand, ctx);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('拖拉机');
  });

  test('自动补牌和AI跟牌都应包含 3344 拖拉机，再补一张同门牌', () => {
    const completed = autoCompleteFollow([], leadCards, southHand, ctx);
    expect(completed.length).toBe(5);
    expect(hasClub3344(completed, ctx)).toBe(true);
    expect(validateFollowPlay(completed, leadCards, southHand, ctx).valid).toBe(true);

    const currentPlays = [
      { seat: 'east' as Seat, cards: leadCards },
      { seat: 'north' as Seat, cards: [club('Q', 201), club('7', 202), club('J', 203), club('5', 204), club('10', 205)] },
      { seat: 'west' as Seat, cards: [club('A', 301), club('K', 302), club('A', 303), club('10', 304), club('8', 305)] },
    ];

    const aiPlay = followCardsStrategy(southHand, leadCards, currentPlays, 'south', ctx);
    expect(aiPlay.length).toBe(5);
    expect(hasClub3344(aiPlay, ctx)).toBe(true);
    expect(validateFollowPlay(aiPlay, leadCards, southHand, ctx).valid).toBe(true);
  });
});
