#!/usr/bin/env bun

import { validateFollowPlay } from './src/core/follow-validator';
import type { Card, GameContext } from './src/core/types';

const ctx: GameContext = {
  level: '2',
  trumpSuit: null,
  dealer: 'east'
};

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

const leadCards: Card[] = [
  { id: 1, suit: 'heart', rank: 'J' },
  { id: 2, suit: 'heart', rank: 'J' },
  { id: 3, suit: 'heart', rank: 'J' }
];

const testCards: Card[] = [
  { id: 10, suit: 'heart', rank: 'K' },
  { id: 11, suit: 'heart', rank: 'K' },
  { id: 19, suit: 'heart', rank: '3' }
];

console.log('测试对子+单牌的验证：');
const validation = validateFollowPlay(testCards, leadCards, hand, ctx);
console.log('验证结果：', validation);
