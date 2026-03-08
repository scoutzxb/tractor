// M4 简化测试：跟牌引擎核心功能

import { describe, test, expect } from 'bun:test';
import { validateFollowPlay, autoCompleteFollow } from '../src/core/follow-validator';
import type { Card, GameContext } from '../src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);

describe('M4: 跟牌引擎', () => {
  const ctx: GameContext = { level: '2', trumpSuit: 'heart' };

  test('无同门牌时可出任意牌', () => {
    const leadCards = [card('spade', 'A', 0), card('spade', 'A', 1)];
    const hand = [card('heart', 'K', 2), card('heart', 'Q', 3)];
    const playCards = [hand[0], hand[1]];
    
    const result = validateFollowPlay(playCards, leadCards, hand, ctx);
    expect(result.valid).toBe(true);
  });

  test('有同门牌时必须出同门', () => {
    const leadCards = [card('spade', 'A', 0), card('spade', 'A', 1)];
    const hand = [card('spade', 'K', 2), card('spade', 'K', 4), card('heart', 'Q', 3)];
    
    // 错误：有黑桃却跟了红桃
    const wrongCards = [hand[2], hand[0]];
    const result1 = validateFollowPlay(wrongCards, leadCards, hand, ctx);
    expect(result1.valid).toBe(false);
    
    // 正确：两张都跟黑桃对子
    const rightCards = [hand[0], hand[1]];
    const result2 = validateFollowPlay(rightCards, leadCards, hand, ctx);
    expect(result2.valid).toBe(true);
  });

  test('自动补选功能', () => {
    const leadCards = [card('spade', 'A', 0), card('spade', 'A', 1), card('spade', 'K', 2)];
    const hand = [card('spade', 'Q', 3), card('heart', '5', 4), card('diamond', '10', 5)];
    const selected = [hand[0]];
    
    const completed = autoCompleteFollow(selected, leadCards, hand, ctx);
    expect(completed.length).toBe(3);
  });

  test('回归: 甩牌含多对子时自动补选必须满足对子优先', () => {
    const ctxNoTrump: GameContext = { level: '4', trumpSuit: null };

    const leadCards = [
      card('club', 'A', 100), card('club', 'A', 101), card('club', 'A', 102),
      card('club', '9', 103), card('club', '9', 104),
      card('club', '8', 105), card('club', '8', 106)
    ];

    const hand = [
      card('club', 'K', 200), card('club', 'K', 201),
      card('club', 'J', 202),
      card('club', '10', 203), card('club', '10', 204),
      card('club', '8', 205), card('club', '6', 206), card('club', '3', 207),
      card('diamond', '2', 208)
    ];

    const illegalFollow = [
      card('club', '3', 207), card('club', '6', 206), card('club', '8', 205),
      card('club', '10', 203), card('club', '10', 204),
      card('club', 'J', 202), card('club', 'K', 200)
    ];

    const invalid = validateFollowPlay(illegalFollow, leadCards, hand, ctxNoTrump);
    expect(invalid.valid).toBe(false);

    const fixed = autoCompleteFollow([], leadCards, hand, ctxNoTrump);
    expect(fixed.length).toBe(7);

    const fixedValid = validateFollowPlay(fixed, leadCards, hand, ctxNoTrump);
    expect(fixedValid.valid).toBe(true);
  });

  test('回归: 跟7788拖拉机时不能拆散，自动补选应给出7788', () => {
    const ctxNoTrump: GameContext = { level: '2', trumpSuit: null };

    const leadCards = [
      card('club', '8', 300), card('club', '8', 301),
      card('club', '7', 302), card('club', '7', 303)
    ];

    const hand = [
      card('club', '10', 309), card('club', '10', 310),
      card('club', '8', 311), card('club', '8', 312),
      card('club', '7', 313), card('club', '7', 314),
      card('club', 'K', 315),
      card('spade', 'A', 316)
    ];

    const brokenFollow = [
      card('club', '10', 309), card('club', '10', 310),
      card('club', '7', 313), card('club', '7', 314)
    ];

    const invalid = validateFollowPlay(brokenFollow, leadCards, hand, ctxNoTrump);
    expect(invalid.valid).toBe(false);

    const fixed = autoCompleteFollow([], leadCards, hand, ctxNoTrump);
    expect(fixed.length).toBe(4);

    const fixedValid = validateFollowPlay(fixed, leadCards, hand, ctxNoTrump);
    expect(fixedValid.valid).toBe(true);

    const rankSorted = fixed.map(c => c.rank).sort();
    expect(rankSorted).toEqual(['7', '7', '8', '8']);
    expect(fixed.every(c => c.suit === 'club')).toBe(true);
  });
});

console.log('✓ M4 测试完成');
