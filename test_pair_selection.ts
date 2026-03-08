#!/usr/bin/env bun

import { leadCardsStrategy } from './src/engine/play-strategy';
import type { Card, GameContext } from './src/core/types';

// 测试数据：west的手牌（从test_grab.txt）
const hand: Card[] = [
  // 主牌
  { id: 1, suit: 'spade', rank: '2' },
  { id: 2, suit: 'heart', rank: '2' },
  { id: 3, suit: 'club', rank: '2' },
  { id: 4, suit: 'diamond', rank: '2' },
  { id: 5, suit: 'diamond', rank: '2' },
  { id: 6, suit: 'spade', rank: 'A' },
  { id: 7, suit: 'spade', rank: 'Q' },
  { id: 8, suit: 'spade', rank: 'Q' },
  { id: 9, suit: 'spade', rank: '10' },
  { id: 10, suit: 'spade', rank: '8' },
  { id: 11, suit: 'spade', rank: '8' },
  // 红桃副牌
  { id: 12, suit: 'heart', rank: 'A' },
  { id: 13, suit: 'heart', rank: 'A' },
  { id: 14, suit: 'heart', rank: 'Q' },
  { id: 15, suit: 'heart', rank: '8' },
  { id: 16, suit: 'heart', rank: '6' },
  { id: 17, suit: 'heart', rank: '5' },
  { id: 18, suit: 'heart', rank: '5' },
  { id: 19, suit: 'heart', rank: '3' },
  // 梅花副牌
  { id: 20, suit: 'club', rank: 'A' },
  { id: 21, suit: 'club', rank: 'K' },
  { id: 22, suit: 'club', rank: 'Q' },
  { id: 23, suit: 'club', rank: 'J' },
  { id: 24, suit: 'club', rank: '10' },
  { id: 25, suit: 'club', rank: '9' },
  { id: 26, suit: 'club', rank: '7' },
  { id: 27, suit: 'club', rank: '6' },
  { id: 28, suit: 'club', rank: '5' },
  { id: 29, suit: 'club', rank: '3' },
  { id: 30, suit: 'club', rank: '3' },
  // 方块副牌
  { id: 31, suit: 'diamond', rank: 'A' },
  { id: 32, suit: 'diamond', rank: 'K' },
  { id: 33, suit: 'diamond', rank: 'J' },
  { id: 34, suit: 'diamond', rank: '9' },
  { id: 35, suit: 'diamond', rank: '9' },
  { id: 36, suit: 'diamond', rank: '8' },
  { id: 37, suit: 'diamond', rank: '7' },
  { id: 38, suit: 'diamond', rank: '5' },
  { id: 39, suit: 'diamond', rank: '4' }
];

const ctx: GameContext = {
  level: '2',
  trumpSuit: 'spade'
};

const selected = leadCardsStrategy(hand, ctx);

console.log('west应该选择的对子:', selected.map(c => 
  c.joker ? c.joker : `${c.suit}${c.rank}`
).join(' '));
console.log('预期: ♥A ♥A (最大的副牌对子)');
