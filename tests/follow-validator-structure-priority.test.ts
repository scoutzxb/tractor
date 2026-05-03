import { describe, expect, test } from 'bun:test';
import { autoCompleteFollow, validateFollowPlay } from '../src/core/follow-validator';
import { enumerateCards } from '../src/core/parser-enumerate';
import type { Card, GameContext } from '../src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);

function maxTractorLength(cards: Card[], ctx: GameContext): number {
  return enumerateCards(cards, ctx).tractors.reduce((max, chain) => Math.max(max, chain.length), 0);
}

describe('跟牌结构优先级回归测试', () => {
  test('有完整三连拖拉机时不能只跟二连拖拉机加散对', () => {
    const ctx: GameContext = { level: '2', trumpSuit: null };
    const leadCards = [
      card('club', '9', 1), card('club', '9', 2),
      card('club', '8', 3), card('club', '8', 4),
      card('club', '7', 5), card('club', '7', 6)
    ];
    const hand = [
      card('club', '9', 11), card('club', '9', 12),
      card('club', '8', 13), card('club', '8', 14),
      card('club', '7', 15), card('club', '7', 16),
      card('club', 'J', 17), card('club', 'J', 18)
    ];
    const illegalFollow = [
      card('club', '8', 13), card('club', '8', 14),
      card('club', '7', 15), card('club', '7', 16),
      card('club', 'J', 17), card('club', 'J', 18)
    ];

    const result = validateFollowPlay(illegalFollow, leadCards, hand, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('拖拉机');

    const completed = autoCompleteFollow([], leadCards, hand, ctx);
    expect(validateFollowPlay(completed, leadCards, hand, ctx).valid).toBe(true);
    expect(maxTractorLength(completed, ctx)).toBe(3);
  });

  test('有三张时不能用对子加单张代替三张', () => {
    const ctx: GameContext = { level: '2', trumpSuit: null };
    const leadCards = [
      card('heart', 'A', 21), card('heart', 'A', 22), card('heart', 'A', 23)
    ];
    const hand = [
      card('heart', 'K', 31), card('heart', 'K', 32), card('heart', 'K', 33),
      card('heart', 'Q', 34)
    ];
    const illegalFollow = [
      card('heart', 'K', 31), card('heart', 'K', 32), card('heart', 'Q', 34)
    ];

    const result = validateFollowPlay(illegalFollow, leadCards, hand, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('三张');

    const completed = autoCompleteFollow([], leadCards, hand, ctx);
    expect(completed.map(c => c.rank).sort()).toEqual(['K', 'K', 'K']);
    expect(validateFollowPlay(completed, leadCards, hand, ctx).valid).toBe(true);
  });

  test('有完整二连超级拖拉机时不能只跟一个三张加散牌', () => {
    const ctx: GameContext = { level: '2', trumpSuit: null };
    const leadCards = [
      card('diamond', '9', 41), card('diamond', '9', 42), card('diamond', '9', 43),
      card('diamond', '8', 44), card('diamond', '8', 45), card('diamond', '8', 46)
    ];
    const hand = [
      card('diamond', 'K', 51), card('diamond', 'K', 52), card('diamond', 'K', 53),
      card('diamond', 'Q', 54), card('diamond', 'Q', 55), card('diamond', 'Q', 56),
      card('diamond', '6', 57), card('diamond', '7', 58)
    ];
    const illegalFollow = [
      card('diamond', 'K', 51), card('diamond', 'K', 52), card('diamond', 'K', 53),
      card('diamond', '6', 57), card('diamond', '7', 58), card('diamond', 'Q', 54)
    ];

    const result = validateFollowPlay(illegalFollow, leadCards, hand, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('超级拖拉机');

    const completed = autoCompleteFollow([], leadCards, hand, ctx);
    expect(validateFollowPlay(completed, leadCards, hand, ctx).valid).toBe(true);
    expect(enumerateCards(completed, ctx).superTractors.some(chain => chain.length >= 2)).toBe(true);
  });

  test('部分已选导致非法结构时，自动补牌回退为合法结构跟牌', () => {
    const ctx: GameContext = { level: '2', trumpSuit: null };
    const leadCards = [
      card('club', '9', 61), card('club', '9', 62),
      card('club', '8', 63), card('club', '8', 64),
      card('club', '7', 65), card('club', '7', 66)
    ];
    const hand = [
      card('club', '9', 71), card('club', '9', 72),
      card('club', '8', 73), card('club', '8', 74),
      card('club', '7', 75), card('club', '7', 76),
      card('club', '3', 77)
    ];

    const completed = autoCompleteFollow([hand[6]], leadCards, hand, ctx);
    expect(completed.length).toBe(6);
    expect(validateFollowPlay(completed, leadCards, hand, ctx).valid).toBe(true);
    expect(maxTractorLength(completed, ctx)).toBe(3);
  });
});
