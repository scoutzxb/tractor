/**
 * 回归测试：第21轮敌方领先时给分问题
 * 
 * 场景来源：game_2026-03-07T14-50-06_cjinkocg.md 第21轮
 * 
 * 问题：北家有♥K ♥3 ♥3三张牌，敌方（东家）已确定能赢。
 * 南家出♣10 ♣9（两张单牌），北家需要出2张牌。
 * 
 * BUG行为：AI选择出♥K ♥3（含10分牌）
 * 正确行为：AI应该出♥3 ♥3（无分牌）
 * 
 * 根本原因：buildSafeVoidDump函数的"拆对惩罚"逻辑错误。
 * 对3无论如何都会被拆掉（手牌3张，需出2张，剩1张，无法保留对子），
 * 所以不应该有拆对惩罚。AI错误地认为♥K不需要拆对而排在前面。
 * 
 * 修复：只有当对子可以保留时（count <= remaining）才考虑拆对惩罚。
 */

import { describe, it, expect } from 'bun:test';
import { followCardsStrategy } from '../src/ai/play-strategy';
import type { Card, GameContext, Seat } from '../src/core/types';

describe('回归测试：第21轮敌方领先时给分问题', () => {
  const ctx: GameContext = {
    trumpSuit: 'diamond',
    level: '5',
    eastWestLevel: 2,
    northSouthLevel: 5
  };

  it('北家应该出♥3♥3而不是♥K♥3（对子无法保留时不应该有拆对惩罚）', () => {
    // 北家手牌：♥K ♥3 ♥3
    const hand: Card[] = [
      { id: 1, suit: 'heart', rank: 'K', joker: undefined },
      { id: 2, suit: 'heart', rank: '3', joker: undefined },
      { id: 3, suit: 'heart', rank: '3', joker: undefined }
    ];

    // 南家领牌：♣10 ♣9（两张单牌）
    const leadCards: Card[] = [
      { id: 4, suit: 'club', rank: '10', joker: undefined },
      { id: 5, suit: 'club', rank: '9', joker: undefined }
    ];

    // 当前出牌情况：南家出了♣10♣9，东家出了♦Q♦A（主牌对）
    // 东家已确定能赢（主牌杀副牌）
    const currentPlays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: leadCards },
      { seat: 'east', cards: [
        { id: 6, suit: 'diamond', rank: 'Q', joker: undefined },
        { id: 7, suit: 'diamond', rank: 'A', joker: undefined }
      ]}
    ];

    // 北家跟牌
    const result = followCardsStrategy(hand, leadCards, currentPlays, 'north', ctx);

    // 验证：应该出♥3♥3（无分），而不是♥K♥3（含10分）
    expect(result.length).toBe(2);
    expect(result.every(c => c.rank === '3')).toBe(true);
    expect(result.some(c => c.rank === 'K')).toBe(false);
  });

  it('验证拆对惩罚条件：count > remaining时不应有惩罚', () => {
    // 场景：手牌5张，需出3张，剩余2张
    // 如果某张牌有3张，剩余2张无法保留完整对子，不应有拆对惩罚
    // 如果某张牌有2张，剩余2张可以保留完整对子，应该有拆对惩罚

    const hand: Card[] = [
      { id: 1, suit: 'heart', rank: 'K', joker: undefined },  // 1张
      { id: 2, suit: 'heart', rank: '3', joker: undefined },  // 3张（count=3, remaining=2, count > remaining）
      { id: 3, suit: 'heart', rank: '3', joker: undefined },
      { id: 4, suit: 'heart', rank: '3', joker: undefined },
      { id: 5, suit: 'heart', rank: '5', joker: undefined }   // 1张（5分）
    ];

    const leadCards: Card[] = [
      { id: 6, suit: 'club', rank: '10', joker: undefined },
      { id: 7, suit: 'club', rank: '9', joker: undefined },
      { id: 8, suit: 'club', rank: '8', joker: undefined }
    ];

    const currentPlays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: leadCards },
      { seat: 'east', cards: [
        { id: 9, suit: 'diamond', rank: 'Q', joker: undefined },
        { id: 10, suit: 'diamond', rank: 'A', joker: undefined },
        { id: 11, suit: 'diamond', rank: 'K', joker: undefined }
      ]}
    ];

    const result = followCardsStrategy(hand, leadCards, currentPlays, 'north', ctx);

    // 验证：应该出♥3♥3♥3或♥K♥3♥3，不应该出♥5（5分牌）
    expect(result.length).toBe(3);
    expect(result.some(c => c.rank === '5')).toBe(false);  // 不应该出5分牌
  });
});
