// 回归测试: 第12局第6轮 - 西家跟牌拖拉机问题
// 问题: 西家有2个2连拖拉机(3344和AA+红桃22)，可以拆一个来补足3对，但引擎认为没别的对子了
// 修复后: validateFollowPlay 正确识别出2对出牌是非法的
// 游戏日志: game_2026-03-15T00-55-59_2xxrailj.md 第12局第6轮

import { describe, test, expect } from 'bun:test';
import { validateFollowPlay } from '../src/core/follow-validator';
import type { Card, GameContext } from '../src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);
const joker = (type: 'big' | 'small', id: number): Card => ({ id, joker: type } as Card);

describe('第12局第6轮 - 西家跟牌拖拉机回归测试', () => {
  const ctx: GameContext = { level: '2', trumpSuit: 'club' };

  test('引擎正确识别西家非法跟牌(只有2对而非3对)', () => {
    // 南家出3连拖拉机
    const leadCards = [
      card('club', '9', 100), card('club', '9', 101),
      card('club', '10', 102), card('club', '10', 103),
      card('club', '8', 104), card('club', '8', 105)
    ];

    // 西家主牌手牌
    const westHand = [
      joker('big', 1), joker('small', 2),
      card('heart', '2', 3), card('heart', '2', 4),
      card('club', 'A', 5), card('club', 'A', 6),
      card('club', 'K', 7), card('club', 'J', 8),
      card('club', '10', 9), card('club', '8', 10),
      card('club', '7', 11), card('club', '5', 12),
      card('club', '4', 13), card('club', '4', 14),
      card('club', '3', 15), card('club', '3', 16)
    ];

    // 西家实际出牌: 3344 + 大王 + 8 = 只有2对(非法)
    const illegalPlay = [
      card('club', '4', 13), card('club', '4', 14),
      card('club', '3', 15), card('club', '3', 16),
      joker('big', 1),
      card('club', '8', 10)
    ];

    const result = validateFollowPlay(illegalPlay, leadCards, westHand, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('对子');
  });

  test('引擎正确识别合法跟牌(3对)', () => {
    const leadCards = [
      card('club', '9', 100), card('club', '9', 101),
      card('club', '10', 102), card('club', '10', 103),
      card('club', '8', 104), card('club', '8', 105)
    ];

    const westHand = [
      joker('big', 1), joker('small', 2),
      card('heart', '2', 3), card('heart', '2', 4),
      card('club', 'A', 5), card('club', 'A', 6),
      card('club', 'K', 7), card('club', 'J', 8),
      card('club', '10', 9), card('club', '8', 10),
      card('club', '7', 11), card('club', '5', 12),
      card('club', '4', 13), card('club', '4', 14),
      card('club', '3', 15), card('club', '3', 16)
    ];

    // 正确跟牌: 3344 + AA = 3对
    const correctPlay = [
      card('club', '4', 13), card('club', '4', 14),
      card('club', '3', 15), card('club', '3', 16),
      card('club', 'A', 5), card('club', 'A', 6)
    ];

    const result = validateFollowPlay(correctPlay, leadCards, westHand, ctx);
    expect(result.valid).toBe(true);
  });
});

console.log('✓ 第12局第6轮回归测试完成 - 引擎现在正确识别非法跟牌');
