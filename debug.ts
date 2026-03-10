import { getSuitOrder, isAdjacent, RANKS } from './src/core/deck';
import type { GameContext, Card } from './src/core/types';

// 调试第一个问题：打K红桃主的红桃副牌序列
const ctx1: GameContext = { level: 'K', trumpSuit: 'heart' };
const suitOrder = getSuitOrder('heart', ctx1);
console.log('红桃副牌序列长度:', suitOrder.length);
console.log('前10张:', suitOrder.slice(0, 10).map(c => c.rank));
console.log('去重后的rank:', [...new Set(suitOrder.map(c => c.rank))]);

// 调试第二个问题：打4时黑桃3和5相邻
const ctx2: GameContext = { level: '4', trumpSuit: 'heart' };
const spade3: Card = { id: 0, suit: 'spade', rank: '3' };
const spade5: Card = { id: 1, suit: 'spade', rank: '5' };
console.log('\n打4时级牌:', ctx2.level);
console.log('黑桃副牌序列（从大到小）:', RANKS.slice().reverse().filter(r => r !== '4'));
console.log('3和5相邻?', isAdjacent(spade3, spade5, ctx2));

// 手动检查areRanksAdjacent逻辑
const filteredRanks = RANKS.slice().reverse().filter(rank => rank !== '4');
console.log('过滤后的序列:', filteredRanks);
console.log('3的索引:', filteredRanks.indexOf('3'));
console.log('5的索引:', filteredRanks.indexOf('5'));
console.log('索引差:', Math.abs(filteredRanks.indexOf('3') - filteredRanks.indexOf('5')));
