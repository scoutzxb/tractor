#!/usr/bin/env bun

import { parseCards, getPlaySuit } from './src/core/parser';
import { classifyCard } from './src/core/deck';
import { validateFollowPlay } from './src/core/follow-validator';
import type { Card, GameContext, Component, Seat } from './src/core/types';

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

// 测试对子+单牌的组合
const testCards1: Card[] = [
  { id: 10, suit: 'heart', rank: 'K' },
  { id: 11, suit: 'heart', rank: 'K' },
  { id: 19, suit: 'heart', rank: '3' }
];

console.log('测试对子+单牌的验证：');
console.log('出牌：♥K ♥K ♥3');
const validation1 = validateFollowPlay(testCards1, leadCards, hand, ctx);
console.log('验证结果：', validation1);

// 测试三张单牌的组合
const testCards2: Card[] = [
  { id: 17, suit: 'heart', rank: '6' },
  { id: 18, suit: 'heart', rank: '4' },
  { id: 19, suit: 'heart', rank: '3' }
];

console.log('\n测试三张单牌的验证：');
console.log('出牌：♥6 ♥4 ♥3');
const validation2 = validateFollowPlay(testCards2, leadCards, hand, ctx);
console.log('验证结果：', validation2);
