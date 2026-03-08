/**
 * 回归测试：抠底分数计算问题
 * 
 * 场景来源：第6局结算时，防家方赢了最后一轮（南家出大王），应该触发抠底
 * 但结算时没有加上抠底分数
 * 
 * 问题根源：web-deal-service.ts 中 calculateResult 的 lastRoundPlay 参数
 * 传递的是所有玩家出的牌，而不是赢家出的牌
 * 这导致抠底倍数计算错误
 */

import { describe, test, expect } from 'bun:test';
import { calculateResult, getPointCards } from '../src/core/scoring';
import type { Card, GameContext, Seat, Rank } from '../src/core/types';

describe('回归测试：抠底分数计算问题', () => {
  test('calculateResult 应该使用赢家出的牌计算抠底倍数', () => {
    // 模拟第6局最后一轮的情况
    // 南家出大王（单张），赢了最后一轮
    // 底牌: ♣8 ♣2 ♠6 ♠2 ♠9 ♣10 (10分)
    // 抠底倍数：单张 × 2 = 20分
    
    const kitty: Card[] = [
      { id: 1, suit: 'club', rank: '8' },
      { id: 2, suit: 'club', rank: '2' },
      { id: 3, suit: 'spade', rank: '6' },
      { id: 4, suit: 'spade', rank: '2' },
      { id: 5, suit: 'spade', rank: '9' },
      { id: 6, suit: 'club', rank: '10' }  // 10分
    ];
    
    const kittyPoints = getPointCards(kitty);
    expect(kittyPoints).toBe(10);
    
    // 南家出的大王（单张）
    const lastWinnerCards: Card[] = [
      { id: 100, joker: 'big' }
    ];
    
    const ctx: GameContext & { dealer: Seat; teamLevels: { eastWest: Rank; northSouth: Rank } } = {
      level: '3',
      trumpSuit: 'diamond',
      dealer: 'east',
      teamLevels: { eastWest: '3', northSouth: '5' }
    };
    
    // 防家得分（不含抠底）
    const attackScore = 260;
    
    // 防家赢了最后一轮，应该触发抠底
    const result = calculateResult(
      attackScore,
      kitty,
      'attack',  // 防家赢
      lastWinnerCards,  // 赢家出的牌（单张大王）
      ctx
    );
    
    // 抠底倍数：单张 × 2
    expect(result.kittyScore).toBe(20);  // 10分 × 2
    expect(result.totalScore).toBe(280);  // 260 + 20
  });
  
  test('如果传递所有牌而非赢家牌，抠底倍数会计算错误', () => {
    const kitty: Card[] = [
      { id: 1, suit: 'club', rank: '10' }  // 10分
    ];
    
    // 模拟错误情况：传递所有4家出的牌
    const allPlays: Card[] = [
      { id: 100, joker: 'big' },  // 南家出大王
      { id: 101, suit: 'club', rank: '5' },  // 东家
      { id: 102, suit: 'spade', rank: '7' },  // 北家
      { id: 103, suit: 'diamond', rank: 'A' }  // 西家
    ];
    
    const ctx: GameContext & { dealer: Seat; teamLevels: { eastWest: Rank; northSouth: Rank } } = {
      level: '3',
      trumpSuit: 'diamond',
      dealer: 'east',
      teamLevels: { eastWest: '3', northSouth: '5' }
    };
    
    const result = calculateResult(
      0,
      kitty,
      'attack',
      allPlays,  // 错误：传递了所有牌
      ctx
    );
    
    // 传递4张牌会被解析为不同结构，抠底倍数可能不是预期的2
    // 这个测试只是展示问题，不是验证正确行为
    console.log('传递所有牌时的抠底倍数计算结果:', result.kittyScore);
  });
});
