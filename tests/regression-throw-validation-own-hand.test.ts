/**
 * 回归测试：甩牌验证应检查领出者自己手牌中的更大牌型
 *
 * 场景来源：game_2026-03-12T12-15-35_5ohg7b35.md 第2局第5轮
 *
 * 问题描述：
 * 第5轮南（庄家）领出：♦9 ♦7 ♦2 ♦9 ♦7 ♦2（甩牌：99 77 22，共6张）
 *
 * 南的初始手牌（方块）：
 * ♦A ♦K ♦K ♦J ♦J ♦10 ♦9 ♦9 ♦7 ♦7 ♦5 ♦5 ♦2 ♦2
 *
 * 南甩牌时手牌中有 ♦5 ♦5（对5），这个比对子5大于甩出的对子2
 * 根据甩牌规则：甩牌必须是目前情况下能确保最大赢牌的组合
 * 如果领出者自己手里还有更大的同门牌型，甩牌就是非法的
 *
 * Bug：validateLeadPlay 只检查 otherHands（其他三家手牌），
 * 不检查领出者自己手牌中是否有更大的牌型
 *
 * 问题根源：game-loop.ts 中 playOneTrick 调用 validateLeadPlay 时
 * 只传递了 order.slice(1)（其他三家）的手牌，没有包括领出者自己的手牌
 */

import { describe, test, expect } from 'bun:test';
import { validateLeadPlay } from '../src/core/lead-validator';
import type { Card, GameContext } from '../src/core/types';

describe('回归测试：甩牌验证应检查领出者自己手牌', () => {
  test('甩牌时如果自己手牌中有更大的对子，甩牌应该失败', () => {
    // 无主游戏上下文
    const ctx: GameContext = {
      level: '3',
      trumpSuit: null, // 无主
    };

    // 南领出的甩牌：♦9 ♦7 ♦2 各两张（甩牌：99 77 22）
    const leadCards: Card[] = [
      { id: 1, suit: 'diamond', rank: '9' },
      { id: 2, suit: 'diamond', rank: '9' },
      { id: 3, suit: 'diamond', rank: '7' },
      { id: 4, suit: 'diamond', rank: '7' },
      { id: 5, suit: 'diamond', rank: '2' },
      { id: 6, suit: 'diamond', rank: '2' },
    ];

    // 关键：南领出甩牌后，南自己剩余的手牌
    // 根据日志，南初始有 ♦A ♦K ♦K ♦J ♦J ♦10 ♦9 ♦9 ♦7 ♦7 ♦5 ♦5 ♦2 ♦2
    // 甩出 ♦9♦9 ♦7♦7 ♦2♦2 后，南手里还有：
    const southRemainingHand: Card[] = [
      { id: 10, suit: 'diamond', rank: 'A' },
      { id: 11, suit: 'diamond', rank: 'K' },
      { id: 12, suit: 'diamond', rank: 'K' },
      { id: 13, suit: 'diamond', rank: 'J' },
      { id: 14, suit: 'diamond', rank: 'J' },
      { id: 15, suit: 'diamond', rank: '10' },
      { id: 16, suit: 'diamond', rank: '5' }, // 关键：♦5 大于甩出的 ♦2
      { id: 17, suit: 'diamond', rank: '5' }, // 关键：♦5 大于甩出的 ♦2
    ];

    // 其他三家手牌（简化，假设没有更大的对子）
    const eastHand: Card[] = [
      { id: 20, suit: 'diamond', rank: '10' },
      { id: 21, suit: 'spade', rank: '8' },
      { id: 22, suit: 'heart', rank: '9' },
      { id: 23, suit: 'heart', rank: 'J' },
      { id: 24, suit: 'spade', rank: 'J' },
      { id: 25, suit: 'heart', rank: 'Q' },
    ];
    const northHand: Card[] = [
      { id: 30, suit: 'diamond', rank: '4' },
      { id: 31, suit: 'diamond', rank: '9' },
      { id: 32, suit: 'heart', rank: 'K' },
      { id: 33, suit: 'club', rank: 'K' },
      { id: 34, suit: 'spade', rank: 'K' },
      { id: 35, suit: 'club', rank: 'K' },
    ];
    const westHand: Card[] = [
      { id: 40, suit: 'diamond', rank: 'A' },
      { id: 41, suit: 'diamond', rank: 'Q' },
      { id: 42, suit: 'spade', rank: '7' },
      { id: 43, suit: 'heart', rank: '7' },
      { id: 44, suit: 'heart', rank: '8' },
      { id: 45, suit: 'club', rank: '9' },
    ];

    // Bug 状态：只检查其他三家手牌（不包括南自己剩余的手牌）
    const otherHandsOnly = [eastHand, northHand, westHand];
    const resultWithBug = validateLeadPlay(leadCards, otherHandsOnly, ctx);

    // Bug 状态：validateLeadPlay 返回 valid: true（因为没有检查南自己的手牌）
    // 这是错误的！南自己手里有更大的 ♦5♦5
    console.log('Bug状态（只检查其他三家）:', resultWithBug);

    // 正确的做法：应该包括领出者自己剩余的手牌
    const allHandsIncludingOwn = [southRemainingHand, eastHand, northHand, westHand];
    const resultCorrect = validateLeadPlay(leadCards, allHandsIncludingOwn, ctx);

    console.log('正确状态（包括自己手牌）:', resultCorrect);

    // 期望：当包括南自己剩余手牌时，验证应该失败
    // 因为南自己手里有 ♦5♦5，这个比对子5大于甩出的 ♦2♦2
    expect(resultCorrect.valid).toBe(false);
    expect(resultCorrect.reason).toContain('存在更大的');
  });

  test('甩牌时如果所有手牌（包括自己）中没有更大的牌型，甩牌应该成功', () => {
    const ctx: GameContext = {
      level: '3',
      trumpSuit: null,
    };

    // 甩牌：♦A ♦K（最大的两张单牌）
    const leadCards: Card[] = [
      { id: 1, suit: 'diamond', rank: 'A' },
      { id: 2, suit: 'diamond', rank: 'K' },
    ];

    // 领出者剩余手牌（没有更大的单牌）
    const ownRemainingHand: Card[] = [
      { id: 10, suit: 'diamond', rank: 'Q' },
      { id: 11, suit: 'diamond', rank: 'J' },
    ];

    // 其他三家手牌（也没有更大的单牌）
    const otherHands: Card[][] = [
      [{ id: 20, suit: 'diamond', rank: '10' }],
      [{ id: 30, suit: 'diamond', rank: '9' }],
      [{ id: 40, suit: 'diamond', rank: '8' }],
    ];

    // 包括自己的所有手牌
    const allHands = [ownRemainingHand, ...otherHands];
    const result = validateLeadPlay(leadCards, allHands, ctx);

    // 应该成功，因为没有更大的单牌
    expect(result.valid).toBe(true);
  });

  test('具体场景：第2局第5轮南甩997722应该失败因为手中有55', () => {
    const ctx: GameContext = {
      level: '3',
      trumpSuit: null, // 无主
    };

    // 根据日志，第5轮南甩牌：♦9 ♦7 ♦2 ♦9 ♦7 ♦2
    const southPlay: Card[] = [
      { id: 1, suit: 'diamond', rank: '9' },
      { id: 2, suit: 'diamond', rank: '9' },
      { id: 3, suit: 'diamond', rank: '7' },
      { id: 4, suit: 'diamond', rank: '7' },
      { id: 5, suit: 'diamond', rank: '2' },
      { id: 6, suit: 'diamond', rank: '2' },
    ];

    // 根据日志，南的初始手牌（39张）：
    const southInitialHand: Card[] = [
      // 主牌
      { id: 100, suit: 'spade', rank: '3' },
      { id: 101, suit: 'heart', rank: '3' },
      // ♠
      { id: 102, suit: 'spade', rank: 'A' },
      { id: 103, suit: 'spade', rank: 'A' },
      { id: 104, suit: 'spade', rank: 'K' },
      { id: 105, suit: 'spade', rank: 'J' },
      { id: 106, suit: 'spade', rank: '10' },
      { id: 107, suit: 'spade', rank: '8' },
      { id: 108, suit: 'spade', rank: '5' },
      { id: 109, suit: 'spade', rank: '5' },
      { id: 110, suit: 'spade', rank: '4' },
      { id: 111, suit: 'spade', rank: '4' },
      // ♥
      { id: 112, suit: 'heart', rank: 'K' },
      { id: 113, suit: 'heart', rank: 'Q' },
      { id: 114, suit: 'heart', rank: 'J' },
      { id: 115, suit: 'heart', rank: '10' },
      { id: 116, suit: 'heart', rank: '9' },
      { id: 117, suit: 'heart', rank: '7' },
      { id: 118, suit: 'heart', rank: '5' },
      { id: 119, suit: 'heart', rank: '4' },
      { id: 120, suit: 'heart', rank: '4' },
      // ♣
      { id: 121, suit: 'club', rank: 'A' },
      { id: 122, suit: 'club', rank: 'Q' },
      { id: 123, suit: 'club', rank: '9' },
      { id: 124, suit: 'club', rank: '4' },
      // ♦
      { id: 125, suit: 'diamond', rank: 'A' },
      { id: 126, suit: 'diamond', rank: 'K' },
      { id: 127, suit: 'diamond', rank: 'K' },
      { id: 128, suit: 'diamond', rank: 'J' },
      { id: 129, suit: 'diamond', rank: 'J' },
      { id: 130, suit: 'diamond', rank: '10' },
      { id: 131, suit: 'diamond', rank: '9' }, // 第1张♦9
      { id: 132, suit: 'diamond', rank: '9' }, // 第2张♦9
      { id: 133, suit: 'diamond', rank: '7' }, // 第1张♦7
      { id: 134, suit: 'diamond', rank: '7' }, // 第2张♦7
      { id: 135, suit: 'diamond', rank: '5' }, // 第1张♦5 - 大于甩出的♦2
      { id: 136, suit: 'diamond', rank: '5' }, // 第2张♦5 - 大于甩出的♦2
      { id: 137, suit: 'diamond', rank: '2' }, // 第1张♦2
      { id: 138, suit: 'diamond', rank: '2' }, // 第2张♦2
    ];

    // 南甩牌后剩余的手牌
    const southAfterPlay = southInitialHand.filter(
      card => !southPlay.some(playCard => playCard.id === card.id)
    );

    // 验证：剩余手牌中应该有 ♦5♦5
    const hasPair5 = southAfterPlay.filter(c => c.suit === 'diamond' && c.rank === '5').length === 2;
    expect(hasPair5).toBe(true);

    // 其他三家第5轮的手牌（根据日志）
    const eastHand: Card[] = [
      { id: 201, joker: 'small' },
      { id: 202, joker: 'small' },
      { id: 203, suit: 'club', rank: '3' },
      { id: 204, suit: 'club', rank: '3' },
      { id: 205, suit: 'diamond', rank: '3' },
      { id: 206, suit: 'spade', rank: 'Q' },
      { id: 207, suit: 'spade', rank: 'J' },
      { id: 208, suit: 'spade', rank: '8' },
      { id: 209, suit: 'spade', rank: '7' },
      { id: 210, suit: 'spade', rank: '7' },
      { id: 211, suit: 'spade', rank: '2' },
      { id: 212, suit: 'spade', rank: '2' },
      { id: 213, suit: 'heart', rank: 'Q' },
      { id: 214, suit: 'heart', rank: 'J' },
      { id: 215, suit: 'heart', rank: '10' },
      { id: 216, suit: 'heart', rank: '9' },
      { id: 217, suit: 'heart', rank: '8' },
      { id: 218, suit: 'heart', rank: '8' },
      { id: 219, suit: 'heart', rank: '6' },
      { id: 220, suit: 'heart', rank: '6' },
      { id: 221, suit: 'heart', rank: '6' },
      { id: 222, suit: 'heart', rank: '2' },
      { id: 223, suit: 'heart', rank: '2' },
      { id: 224, suit: 'club', rank: 'Q' },
      { id: 225, suit: 'club', rank: 'J' },
      { id: 226, suit: 'club', rank: '10' },
      { id: 227, suit: 'club', rank: '10' },
      { id: 228, suit: 'club', rank: '7' },
      { id: 229, suit: 'club', rank: '7' },
      { id: 230, suit: 'club', rank: '6' },
      { id: 231, suit: 'club', rank: '6' },
      { id: 232, suit: 'club', rank: '5' },
      { id: 233, suit: 'club', rank: '5' },
      { id: 234, suit: 'diamond', rank: 'A' },
      { id: 235, suit: 'diamond', rank: '10' },
      { id: 236, suit: 'diamond', rank: '8' },
      { id: 237, suit: 'diamond', rank: '8' },
      { id: 238, suit: 'diamond', rank: '4' },
      { id: 239, suit: 'diamond', rank: '4' },
    ];

    const northHand: Card[] = [
      { id: 301, joker: 'big' },
      { id: 302, joker: 'small' },
      { id: 303, suit: 'spade', rank: '3' },
      { id: 304, suit: 'heart', rank: '3' },
      { id: 305, suit: 'heart', rank: '3' },
      { id: 306, suit: 'diamond', rank: '3' },
      { id: 307, suit: 'diamond', rank: '3' },
      { id: 308, suit: 'spade', rank: 'K' },
      { id: 309, suit: 'spade', rank: 'K' },
      { id: 310, suit: 'spade', rank: 'J' },
      { id: 311, suit: 'spade', rank: '9' },
      { id: 312, suit: 'spade', rank: '9' },
      { id: 313, suit: 'spade', rank: '8' },
      { id: 314, suit: 'spade', rank: '6' },
      { id: 315, suit: 'spade', rank: '6' },
      { id: 316, suit: 'spade', rank: '6' },
      { id: 317, suit: 'spade', rank: '4' },
      { id: 318, suit: 'heart', rank: 'A' },
      { id: 319, suit: 'heart', rank: 'A' },
      { id: 320, suit: 'heart', rank: 'K' },
      { id: 321, suit: 'heart', rank: 'Q' },
      { id: 322, suit: 'heart', rank: '7' },
      { id: 323, suit: 'heart', rank: '2' },
      { id: 324, suit: 'club', rank: 'K' },
      { id: 325, suit: 'club', rank: 'K' },
      { id: 326, suit: 'club', rank: 'K' },
      { id: 327, suit: 'club', rank: 'J' },
      { id: 328, suit: 'club', rank: 'J' },
      { id: 329, suit: 'club', rank: '9' },
      { id: 330, suit: 'club', rank: '8' },
      { id: 331, suit: 'club', rank: '6' },
      { id: 332, suit: 'club', rank: '2' },
      { id: 333, suit: 'diamond', rank: 'K' },
      { id: 334, suit: 'diamond', rank: '10' },
      { id: 335, suit: 'diamond', rank: '9' },
      { id: 336, suit: 'diamond', rank: '6' },
      { id: 337, suit: 'diamond', rank: '6' },
      { id: 338, suit: 'diamond', rank: '5' },
      { id: 339, suit: 'diamond', rank: '4' },
    ];

    const westHand: Card[] = [
      { id: 401, joker: 'big' },
      { id: 402, joker: 'big' },
      { id: 403, suit: 'spade', rank: '3' },
      { id: 404, suit: 'club', rank: '3' },
      { id: 405, suit: 'spade', rank: 'A' },
      { id: 406, suit: 'spade', rank: 'Q' },
      { id: 407, suit: 'spade', rank: 'Q' },
      { id: 408, suit: 'spade', rank: '10' },
      { id: 409, suit: 'spade', rank: '10' },
      { id: 410, suit: 'spade', rank: '9' },
      { id: 411, suit: 'spade', rank: '7' },
      { id: 412, suit: 'heart', rank: 'A' },
      { id: 413, suit: 'heart', rank: 'K' },
      { id: 414, suit: 'heart', rank: 'J' },
      { id: 415, suit: 'heart', rank: '10' },
      { id: 416, suit: 'heart', rank: '9' },
      { id: 417, suit: 'heart', rank: '8' },
      { id: 418, suit: 'heart', rank: '7' },
      { id: 419, suit: 'heart', rank: '5' },
      { id: 420, suit: 'heart', rank: '5' },
      { id: 421, suit: 'club', rank: 'A' },
      { id: 422, suit: 'club', rank: 'A' },
      { id: 423, suit: 'club', rank: 'Q' },
      { id: 424, suit: 'club', rank: '10' },
      { id: 425, suit: 'club', rank: '9' },
      { id: 426, suit: 'club', rank: '8' },
      { id: 427, suit: 'club', rank: '8' },
      { id: 428, suit: 'club', rank: '7' },
      { id: 429, suit: 'club', rank: '4' },
      { id: 430, suit: 'club', rank: '4' },
      { id: 431, suit: 'club', rank: '2' },
      { id: 432, suit: 'club', rank: '2' },
      { id: 433, suit: 'diamond', rank: 'A' },
      { id: 434, suit: 'diamond', rank: 'Q' },
      { id: 435, suit: 'diamond', rank: 'Q' },
      { id: 436, suit: 'diamond', rank: 'Q' },
      { id: 437, suit: 'diamond', rank: 'J' },
      { id: 438, suit: 'diamond', rank: '8' },
      { id: 439, suit: 'diamond', rank: '7' },
    ];

    // Bug 状态：只检查其他三家手牌
    const resultBug = validateLeadPlay(southPlay, [eastHand, northHand, westHand], ctx);
    console.log('Bug状态 - 只检查其他三家:', resultBug);

    // 正确做法：包括南自己剩余的手牌
    const resultCorrect = validateLeadPlay(
      southPlay,
      [southAfterPlay, eastHand, northHand, westHand],
      ctx
    );
    console.log('正确状态 - 包括南自己手牌:', resultCorrect);

    // 期望：当包括南自己剩余手牌时，验证应该失败
    expect(resultCorrect.valid).toBe(false);
    expect(resultCorrect.reason).toMatch(/存在更大的/);
  });
});
