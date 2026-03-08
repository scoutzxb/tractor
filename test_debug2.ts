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

const followCards: Card[] = [
  { id: 10, suit: 'heart', rank: 'K' },
  { id: 11, suit: 'heart', rank: 'K' },
  { id: 19, suit: 'heart', rank: '3' }
];

const leadComponents = parseCards(leadCards, ctx);
const followComponents = parseCards(followCards, ctx);

console.log('领牌组件：');
leadComponents.forEach(c => console.log(`  ${c.type}: ${c.cards.length}张`));

console.log('\n跟牌组件：');
followComponents.forEach(c => {
  console.log(`  ${c.type}: ${c.cards.map(x => `${x.suit}${x.rank}`).join(' ')}`);
});

function countComponentTypes(components: Component[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const comp of components) {
    const current = counts.get(comp.type) || 0;
    counts.set(comp.type, current + 1);
  }
  return counts;
}

const leadCounts = countComponentTypes(leadComponents);
const followCounts = countComponentTypes(followComponents);

console.log('\n领牌统计：');
leadCounts.forEach((count, type) => console.log(`  ${type}: ${count}`));

console.log('\n跟牌统计：');
followCounts.forEach((count, type) => console.log(`  ${type}: ${count}`));

// 模拟canMatchBySplitting
console.log('\n模拟canMatchBySplitting：');

const neededTriples = leadCounts.get('triple') || 0;
const neededPairs = leadCounts.get('pair') || 0;
const neededSingles = leadCounts.get('single') || 0;

let availableTriples = followCounts.get('triple') || 0;
let availablePairs = followCounts.get('pair') || 0;
let availableSingles = followCounts.get('single') || 0;

console.log(`需要：三张${neededTriples}, 对子${neededPairs}, 单牌${neededSingles}`);
console.log(`可用：三张${availableTriples}, 对子${availablePairs}, 单牌${availableSingles}`);

if (availableTriples < neededTriples) {
  const deficit = neededTriples - availableTriples;
  console.log(`\n三张不够，缺少${deficit}个`);
  console.log(`检查：对子${availablePairs} >= ${deficit}? ${availablePairs >= deficit}`);
  console.log(`检查：单牌${availableSingles} >= ${deficit}? ${availableSingles >= deficit}`);
  
  if (availablePairs >= deficit && availableSingles >= deficit) {
    console.log(`✅ 可以用对子+单牌组合`);
    availablePairs -= deficit;
    availableSingles -= deficit;
    console.log(`剩余：对子${availablePairs}, 单牌${availableSingles}`);
  }
}

console.log(`\n最终：对子${availablePairs} >= 需要的对子${neededPairs}? ${availablePairs >= neededPairs}`);
console.log(`最终：单牌${availableSingles} >= 需要的单牌${neededSingles}? ${availableSingles >= neededSingles}`);
