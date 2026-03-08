// 测试方块主时的牌型识别

import { parseCards } from './src/core/parser';
import { isTrump, sortHand } from './src/core/deck';
import type { Card, GameContext } from './src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);

// 方块主，打2
const ctx: GameContext = { level: '2', trumpSuit: 'diamond' };

const hand: Card[] = [
  card('spade', 'K', 0),
  card('spade', 'Q', 1),
  card('spade', '5', 2),
  card('spade', '5', 3),
  card('spade', '4', 4),
  card('spade', '4', 5),
  card('heart', 'K', 6),
  card('heart', 'K', 7),
  card('heart', 'J', 8),
  card('heart', 'J', 9),
  card('club', '10', 10),
  card('club', '10', 11),
  card('club', '10', 12),
];

console.log('手牌数量:', hand.length);
console.log('主牌:', ctx.trumpSuit, '级牌:', ctx.level);
console.log('');

const components = parseCards(hand, ctx);

console.log('牌型解析结果:');
console.log('总组件数:', components.length);
console.log('');

components.forEach(c => {
  const isTrumpComp = isTrump(c.cards[0], ctx);
  console.log(`${c.type}: ${c.cards.length}张, ${isTrumpComp ? '主牌' : '副牌'}, cards:`, c.cards.map(card => `${card.suit}${card.rank}`));
});

console.log('');

const trumpComponents = components.filter(c => isTrump(c.cards[0], ctx));
const nonTrumpComponents = components.filter(c => !isTrump(c.cards[0], ctx));

console.log('主牌组合:', trumpComponents.length);
console.log('副牌组合:', nonTrumpComponents.length);
console.log('');

const nonTrumpPairs = nonTrumpComponents.filter(c => c.type === 'pair');
console.log('副牌对子:', nonTrumpPairs.length);
nonTrumpPairs.forEach(p => {
  console.log('  ', p.cards.map(c => `${c.suit}${c.rank}`));
});

const nonTrumpTriples = nonTrumpComponents.filter(c => c.type === 'triple');
console.log('副牌三张:', nonTrumpTriples.length);
nonTrumpTriples.forEach(p => {
  console.log('  ', p.cards.map(c => `${c.suit}${c.rank}`));
});
