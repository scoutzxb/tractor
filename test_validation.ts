import { parseCards } from './src/core/parser';
import type { Card, GameContext } from './src/core/types';

const ctx: GameContext = {
  level: '2',
  trumpSuit: 'heart',
  dealer: 'east',
  currentTrick: [],
  scores: {}
};

// 模拟手牌：2对+1单
const hand: Card[] = [
  { id: 1, suit: 'spade', rank: 'A' },
  { id: 2, suit: 'spade', rank: 'A' },
  { id: 3, suit: 'spade', rank: 'K' },
  { id: 4, suit: 'spade', rank: 'K' },
  { id: 5, suit: 'spade', rank: 'Q' },
];

// 解析跟牌结构
const components = parseCards(hand, ctx);
console.log("跟牌结构:", components.map(c => ({ type: c.type, cards: c.cards.length, ranks: c.cards.map(x => x.rank) })));

// 统计各类型数量
const counts = new Map<string, number>();
for (const comp of components) {
  counts.set(comp.type, (counts.get(comp.type) || 0) + 1);
}
console.log("类型统计:", Object.fromEntries(counts));
