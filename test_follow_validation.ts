#!/usr/bin/env bun

import { followCardsStrategy } from './src/engine/play-strategy';
import type { Card, GameContext, Seat } from './src/core/types';

// 创建测试场景
const ctx: GameContext = {
  level: '2',
  trumpSuit: null, // 无主
  dealer: 'east'
};

// 首家出三张红桃J
const leadCards: Card[] = [
  { id: 1, suit: 'heart', rank: 'J' },
  { id: 2, suit: 'heart', rank: 'J' },
  { id: 3, suit: 'heart', rank: 'J' }
];

// west的手牌：有红桃K对子和红桃9对子
const hand: Card[] = [
  { id: 10, suit: 'heart', rank: 'K' },
  { id: 11, suit: 'heart', rank: 'K' },
  { id: 12, suit: 'heart', rank: 'Q' },
  { id: 13, suit: 'heart', rank: '10' },
  { id: 14, suit: 'heart', rank: '9' },
  { id: 15, suit: 'heart', rank: '9' },
  { id: 16, suit: 'heart', rank: '7' },
  { id: 17, suit: 'heart', rank: '6' },
  { id: 18, suit: 'heart', rank: '4' },
  { id: 19, suit: 'heart', rank: '3' }
];

// 当前出牌情况（假设east已经出了牌）
const currentPlays: Array<{ seat: Seat; cards: Card[] }> = [
  { seat: 'east', cards: leadCards }
];

console.log('测试场景：');
console.log('首家出：♥J ♥J ♥J (三张)');
console.log('west手牌：♥K ♥K ♥Q ♥10 ♥9 ♥9 ♥7 ♥6 ♥4 ♥3');
console.log('west有红桃K对子和红桃9对子\n');

const result = followCardsStrategy(hand, leadCards, currentPlays, 'west', ctx);

console.log('west跟牌结果：');
console.log(result.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`).join(' '));
console.log('\n预期：应该包含对子（♥K♥K或♥9♥9）+ 单牌');
console.log('不应该：三张单牌（如♥3♥4♥6）');

// 检查是否包含对子
const hasPair = result.some((card, idx) => {
  if (idx === 0) return false;
  const prev = result[idx - 1];
  return card.rank === prev.rank && card.suit === prev.suit;
});

console.log(`\n验证：${hasPair ? '✅ 包含对子' : '❌ 没有对子'}`);
