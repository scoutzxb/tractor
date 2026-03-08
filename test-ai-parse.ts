// 测试AI牌型识别

import { parseCards } from './src/core/parser';
import { createDeck, shuffle, deal, sortHand, isTrump, classifyCard } from './src/core/deck';
import type { Card, GameContext } from './src/core/types';

const ctx: GameContext = { level: '2', trumpSuit: null }; // 无主局

// 创建一副牌
const deck = createDeck();
const shuffled = shuffle(deck);
const { hands } = deal(shuffled);

// 测试第一个玩家的手牌
const hand = hands[0];
console.log('手牌数量:', hand.length);

// 排序
const sorted = sortHand([...hand], ctx);

// 解析牌型
const components = parseCards(hand, ctx);

console.log('\n牌型解析结果:');
console.log('总组件数:', components.length);

// 分类统计
const byType = new Map<string, number>();
for (const comp of components) {
  const count = byType.get(comp.type) || 0;
  byType.set(comp.type, count + 1);
}

console.log('\n各类型数量:');
byType.forEach((count, type) => {
  console.log(`  ${type}: ${count}`);
});

// 分类主牌和副牌
const trumpComps = components.filter(c => isTrump(c.cards[0], ctx));
const nonTrumpComps = components.filter(c => !isTrump(c.cards[0], ctx));

console.log(`\n主牌组合: ${trumpComps.length}`);
console.log(`副牌组合: ${nonTrumpComps.length}`);

// 显示副牌组合
if (nonTrumpComps.length > 0) {
  console.log('\n副牌组合详情:');
  nonTrumpComps.forEach(c => {
    const classInfo = classifyCard(c.cards[0], ctx);
    const suit = classInfo === 'trump' ? '主牌' : (classInfo as any).suit;
    console.log(`  ${c.type}: ${c.cards.length}张, 花色: ${suit}`);
  });
}

// 找副牌对子
const pairs = nonTrumpComps.filter(c => c.type === 'pair');
if (pairs.length > 0) {
  console.log(`\n找到副牌对子: ${pairs.length}个`);
}

// 找副牌三张
const triples = nonTrumpComps.filter(c => c.type === 'triple');
if (triples.length > 0) {
  console.log(`找到副牌三张: ${triples.length}个`);
}
