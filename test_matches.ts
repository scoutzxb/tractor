#!/usr/bin/env bun

import { parseCards } from './src/core/parser';
import type { Card, GameContext, Component } from './src/core/types';

const ctx: GameContext = {
  level: '2',
  trumpSuit: null,
  dealer: 'east'
};

const leadCards: Card[] = [
  { id: 1, suit: 'heart', rank: 'J' },
  { id: 2, suit: 'heart', rank: 'J' },
  { id: 3, suit: 'heart', rank: 'J' }
];

const suitCards: Card[] = [
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

const leadComponents = parseCards(leadCards, ctx);
const suitComponents = parseCards(suitCards, ctx);

console.log('领牌组件：');
leadComponents.forEach(c => console.log(`  ${c.type}`));

console.log('\n同门牌组件：');
suitComponents.forEach(c => {
  console.log(`  ${c.type}: ${c.cards.map(x => `${x.suit}${x.rank}`).join(' ')}`);
});

// 模拟findMatchingCombinations
function findMatchingCombinations(
  leadComponents: Component[],
  suitComponents: Component[]
): Component[][] {
  const needs = {
    superTractors: leadComponents.filter(c => c.type === 'super_tractor').length,
    triples: leadComponents.filter(c => c.type === 'triple').length,
    tractors: leadComponents.filter(c => c.type === 'tractor').length,
    pairs: leadComponents.filter(c => c.type === 'pair').length,
    singles: leadComponents.filter(c => c.type === 'single').length
  };
  
  const available = {
    superTractors: suitComponents.filter(c => c.type === 'super_tractor'),
    triples: suitComponents.filter(c => c.type === 'triple'),
    tractors: suitComponents.filter(c => c.type === 'tractor'),
    pairs: suitComponents.filter(c => c.type === 'pair'),
    singles: suitComponents.filter(c => c.type === 'single')
  };
  
  console.log('\n需求：', needs);
  console.log('可用：', {
    superTractors: available.superTractors.length,
    triples: available.triples.length,
    tractors: available.tractors.length,
    pairs: available.pairs.length,
    singles: available.singles.length
  });
  
  // 尝试直接匹配
  if (available.superTractors.length >= needs.superTractors &&
      available.triples.length >= needs.triples &&
      available.tractors.length >= needs.tractors &&
      available.pairs.length >= needs.pairs &&
      available.singles.length >= needs.singles) {
    console.log('\n✅ 可以完全匹配');
    const result: Component[] = [];
    result.push(...available.superTractors.slice(0, needs.superTractors));
    result.push(...available.triples.slice(0, needs.triples));
    result.push(...available.tractors.slice(0, needs.tractors));
    result.push(...available.pairs.slice(0, needs.pairs));
    result.push(...available.singles.slice(0, needs.singles));
    return [result];
  }
  
  console.log('\n❌ 无法完全匹配');
  return [];
}

const matches = findMatchingCombinations(leadComponents, suitComponents);
console.log('\n匹配结果数量：', matches.length);
