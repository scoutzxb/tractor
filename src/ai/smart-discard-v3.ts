// 智能扣底牌策略（最终修复版）

import type { Card, GameContext, Suit } from './src/core/types';
import { parseCards } from './src/core/parser';
import { isTrump, SUIT_NAMES } from './src/core/deck';

/**
 * 智能扣底牌策略
 * 
 * 策略：
 * 1. 绝对不扣：级牌（所有花色的当前级别牌）、大王、小王
 * 2. 优先不扣：主花色牌（如果主花色确定了）
 * 3. 不破坏高级牌型（对子、拖拉机、三张）
 * 4. 从所有非主牌单牌中选择最小的（不强制分散）
 * 5. 如果不够，从主花色牌中选择最小的
 */
export function smartDiscardKitty(
  hand: Card[],
  ctx: GameContext,
  count: number = 6
): Card[] {
  // 解析手牌，识别牌型
  const components = parseCards(hand, ctx);
  
  // 找出所有单牌
  const allSingles: Card[] = [];
  for (const comp of components) {
    if (comp.type === 'single') {
      allSingles.push(comp.cards[0]);
    }
  }
  
  // 点数值
  const rankValues: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  // 分类：级牌、王、主花色牌、非主牌单牌
  const levelCards: Card[] = [];
  const jokers: Card[] = [];
  const trumpCards: Card[] = [];
  const nonTrumpSingles: Card[] = [];
  
  for (const card of allSingles) {
    // 级牌绝对不能扣
    if (card.rank === ctx.level) {
      levelCards.push(card);
      continue;
    }
    // 王绝对不能扣
    if (card.joker) {
      jokers.push(card);
      continue;
    }
    // 主花色牌优先不扣
    if (ctx.trumpSuit && card.suit === ctx.trumpSuit) {
      trumpCards.push(card);
      continue;
    }
    // 非主牌单牌
    nonTrumpSingles.push(card);
  }
  
  // 排序：从小到大
  nonTrumpSingles.sort((a, b) => rankValues[a.rank!] - rankValues[b.rank!]);
  trumpCards.sort((a, b) => rankValues[a.rank!] - rankValues[b.rank!]);
  
  // 选择最小的牌（不强制分散）
  const candidates: Card[] = [];
  
  // 1. 优先从非主牌单牌中选最小的
  for (const card of nonTrumpSingles) {
    if (candidates.length >= count) break;
    candidates.push(card);
  }
  
  // 2. 如果不够，从主花色牌中选最小的
  if (candidates.length < count) {
    for (const card of trumpCards) {
      if (candidates.length >= count) break;
      candidates.push(card);
    }
  }
  
  // 统计信息
  const totalLevel = hand.filter(c => c.rank === ctx.level).length;
  const totalJokers = hand.filter(c => c.joker).length;
  const totalTrump = ctx.trumpSuit ? hand.filter(c => c.suit === ctx.trumpSuit).length : 0;
  const totalNonTrump = hand.length - totalTrump - totalJokers;
  
  console.log(`   策略: 级牌${totalLevel}张 王${totalJokers}张 主${totalTrump}张 非${totalNonTrump}张`);
  console.log(`   非主单牌: ${nonTrumpSingles.length}张, 主牌单牌: ${trumpCards.length}张`);
  console.log(`   扣: ${candidates.slice(0, count).map(c => `${SUIT_NAMES[c.suit!]}${c.rank}`).join(' ')}`);
  
  return candidates.slice(0, count);
}
