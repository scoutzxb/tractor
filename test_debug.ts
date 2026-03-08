#!/usr/bin/env bun

import { parseCards } from './src/core/parser';
import { classifyCard } from './src/core/deck';
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

console.log('解析west的红桃手牌：');
const components = parseCards(hand, ctx);
console.log('解析结果：');
components.forEach(comp => {
  const cards = comp.cards.map(c => `${c.suit}${c.rank}`).join(' ');
  console.log(`  ${comp.type}: ${cards}`);
});
