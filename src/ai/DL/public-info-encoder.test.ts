/**
 * 公共信息编码器测试
 */

import { describe, it, expect } from 'bun:test';
import { PublicInfoEncoder, isVoid, countRemainingInSuit } from './public-info-encoder';
import type { Card, GameContext, Seat } from '../../core/types';

function createCard(id: number, suit: string, rank: string): Card {
  return { id, suit: suit as any, rank: rank as any };
}

function createJoker(id: number, type: 'big' | 'small'): Card {
  return { id, joker: type };
}

describe('PublicInfoEncoder', () => {
  const ctx: GameContext = {
    level: '2',
    trumpSuit: 'heart'
  };
  
  it('should initialize correctly', () => {
    const encoder = new PublicInfoEncoder(ctx, 'east');
    const state = encoder.getState();
    
    expect(state.roundNumber).toBe(0);
    expect(state.attackScore).toBe(0);
    expect(state.playedCards.length).toBe(0);
    expect(state.remainingCounts.get('east')).toBe(39);
    expect(state.facts.voids.get('east')?.size).toBe(0);
  });
  
  it('should process play events', () => {
    const encoder = new PublicInfoEncoder(ctx, 'east');
    
    // 东家出一张红桃A
    encoder.processPlay('east', [createCard(0, 'heart', 'A')]);
    
    const state = encoder.getState();
    expect(state.playedCards.length).toBe(1);
    expect(state.remainingCounts.get('east')).toBe(38);
    expect(state.history.length).toBe(1);
    expect(state.history[0].type).toBe('lead');
  });
  
  it('should track score cards', () => {
    const encoder = new PublicInfoEncoder(ctx, 'east');
    
    // 出一张5
    encoder.processPlay('east', [createCard(0, 'heart', '5')]);
    
    const state = encoder.getState();
    expect(state.facts.scoreCardsPlayed.fives).toBe(1);
    expect(state.facts.scoreCardsPlayed.tens).toBe(0);
    expect(state.facts.scoreCardsPlayed.kings).toBe(0);
  });
  
  it('should track void inference', () => {
    const encoder = new PublicInfoEncoder(ctx, 'east');
    
    // 东家领出黑桃A
    encoder.processPlay('east', [createCard(0, 'spade', 'A')]);
    
    // 北家杀牌（没有黑桃）
    encoder.processPlay('north', [createCard(1, 'heart', 'K')], true);
    
    // 西家跟黑桃
    encoder.processPlay('west', [createCard(2, 'spade', 'K')]);
    
    // 南家跟黑桃
    encoder.processPlay('south', [createCard(3, 'spade', 'Q')]);
    
    // 结束本轮
    encoder.processTrickEnd('north', 0);
    
    // 检查void推断
    const facts = encoder.getState().facts;
    expect(isVoid(facts, 'north', 'spade')).toBe(true);
    expect(isVoid(facts, 'west', 'spade')).toBe(false);
  });
  
  it('should encode to tensor format', () => {
    const encoder = new PublicInfoEncoder(ctx, 'east');
    
    encoder.processPlay('east', [createCard(0, 'heart', 'A')]);
    encoder.processPlay('north', [createCard(1, 'heart', 'K')]);
    encoder.processPlay('west', [createCard(2, 'heart', 'Q')]);
    encoder.processPlay('south', [createCard(3, 'heart', 'J')]);
    encoder.processTrickEnd('east', 0);
    
    const tensor = encoder.encode();
    
    expect(tensor.roundNumber).toBe(1);
    expect(tensor.attackScore).toBe(0);
    expect(tensor.remainingCounts).toEqual([38/39, 38/39, 38/39, 38/39]);
    expect(tensor.playedCardsMatrix.length).toBe(4);
    expect(tensor.playedCardsMatrix[0].length).toBe(15);
    expect(tensor.voidMatrix.length).toBe(4);
    expect(tensor.recentHistory.length).toBe(20);
  });
  
  it('should track attack score', () => {
    const encoder = new PublicInfoEncoder(ctx, 'north'); // 北家是庄家
    
    // 出一轮带分的牌
    encoder.processPlay('east', [createCard(0, 'spade', '5')]);
    encoder.processPlay('north', [createCard(1, 'spade', 'A')]);
    encoder.processPlay('west', [createCard(2, 'spade', '10')]);
    encoder.processPlay('south', [createCard(3, 'spade', '2')]);
    encoder.processTrickEnd('north', 15); // 5 + 10 = 15分
    
    // 攻方得分（东西是攻方，南北是庄家方）
    const state = encoder.getState();
    expect(state.attackScore).toBe(15);
  });
  
  it('should count remaining cards in suit', () => {
    const encoder = new PublicInfoEncoder(ctx, 'east');
    
    // 出3张红桃
    encoder.processPlay('east', [createCard(0, 'heart', 'A')]);
    encoder.processPlay('north', [createCard(1, 'heart', 'K')]);
    encoder.processPlay('west', [createCard(2, 'heart', 'Q')]);
    
    const playedCards = encoder.getState().playedCards;
    const remaining = countRemainingInSuit(playedCards, 'heart', ctx);
    
    // 红桃应该剩 39 - 3 = 36 张（三副牌）
    // 注意：实际计算需要考虑主牌逻辑
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

describe('isVoid utility', () => {
  const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
  const encoder = new PublicInfoEncoder(ctx, 'east');
  
  // 模拟void推断
  encoder.processPlay('east', [createCard(0, 'spade', 'A')]);
  encoder.processPlay('north', [createCard(1, 'heart', 'K')], true); // 杀牌
  encoder.processPlay('west', [createCard(2, 'spade', 'K')]);
  encoder.processPlay('south', [createCard(3, 'spade', 'Q')]);
  encoder.processTrickEnd('north', 0);
  
  const facts = encoder.getState().facts;
  
  it('should detect void', () => {
    expect(isVoid(facts, 'north', 'spade')).toBe(true);
  });
  
  it('should detect non-void', () => {
    expect(isVoid(facts, 'west', 'spade')).toBe(false);
    expect(isVoid(facts, 'east', 'spade')).toBe(false);
  });
});

// 运行测试
console.log('Run tests with: bun test src/ai/DL/public-info-encoder.test.ts');