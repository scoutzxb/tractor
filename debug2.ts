import { getSuitOrder, isAdjacent, classifyCard, RANKS } from './src/core/deck';
import type { GameContext, Card } from './src/core/types';

// 问题1：打K红桃主的红桃副牌序列
const ctx1: GameContext = { level: 'K', trumpSuit: 'heart' };
const suitOrder = getSuitOrder('heart', ctx1);
console.log('红桃副牌序列（所有）:', suitOrder.map(c => c.rank).join(','));
console.log('是否包含K?', suitOrder.some(c => c.rank === 'K'));

// 问题2：打4时黑桃3和5
const ctx2: GameContext = { level: '4', trumpSuit: 'heart' };
const spade3: Card = { id: 0, suit: 'spade', rank: '3' };
const spade5: Card = { id: 1, suit: 'spade', rank: '5' };

console.log('\n打4时:');
console.log('spade3是主牌吗?', classifyCard(spade3, ctx2));
console.log('spade5是主牌吗?', classifyCard(spade5, ctx2));
console.log('3和5同门吗?', classifyCard(spade3, ctx2) === classifyCard(spade5, ctx2));

// 检查isSuitAdjacent
console.log('\n手动检查相邻性:');
const filteredRanks = RANKS.slice().reverse().filter(rank => rank !== '4');
console.log('过滤后序列:', filteredRanks);
const idx3 = filteredRanks.indexOf('3');
const idx5 = filteredRanks.indexOf('5');
console.log(`3的索引: ${idx3}, 5的索引: ${idx5}, 差值: ${Math.abs(idx3 - idx5)}`);
