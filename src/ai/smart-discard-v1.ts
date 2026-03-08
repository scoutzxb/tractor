// 智能扣底牌策略 - 修复版

import type { Card, GameContext, Suit } from './src/core/types';
import { parseCards } from './src/core/parser';
import { isTrump, sortHand, SUIT_NAMES } from './src/core/deck';

/**
 * 智能扣底牌策略
 * 1. 绝对不扣级牌（无论什么牌型）
 * 2. 绝对不扣大王/小王
 * 3. 优先扣非主牌的单牌
 * 4. 不破坏高级牌型（对子、拖拉机、三张）
 * 5. 分散在多个非主花色中
 */
export function smartDiscardKitty(
  hand: Card[],
  ctx: GameContext,
  count: number = 6
): Card[] {
  // 解析手牌，识别牌型
  const components = parseCards(hand, ctx);
  
  // 找出所有可以扣的牌（排除级牌和王）
  const availableCards: Card[] = [];
  
  for (const card of hand) {
    // 级牌绝对不能扣
    if (card.rank === ctx.level) continue;
    
    // 大王小王绝对不能扣
    if (card.joker) continue;
    
    availableCards.push(card);
  }
  
  // 从可扣的牌中，优先选择非主牌的单牌
  const nonTrumpSingles: Card[] = [];
  const trumpSingles: Card[] = [];
  
  for (const comp of components) {
    if (comp.type === 'single') {
      const card = comp.cards[0];
      
      // 确保这张牌在availableCards中
      if (!availableCards.some(c => c.id === card.id)) continue;
      
      if (!isTrump(card, ctx)) {
        nonTrumpSingles.push(card);
      } else {
        trumpSingles.push(card);
      }
    }
  }
  
  // 按花色分组非主牌单牌
  const suitGroups = new Map<Suit, Card[]>();
  for (const card of nonTrumpSingles) {
    const suit = card.suit!;
    if (!suitGroups.has(suit)) {
      suitGroups.set(suit, []);
    }
    suitGroups.get(suit)!.push(card);
  }
  
  // 从每个花色中选择最小的牌
  const candidates: Card[] = [];
  const suits = Array.from(suitGroups.keys());
  
  // 排序函数：按点数从小到大
  const sortByRank = (a: Card, b: Card) => {
    const rankValues: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return rankValues[a.rank!] - rankValues[b.rank!];
  };
  
  // 轮流从每个花色中选择最小的牌
  let idx = 0;
  while (candidates.length < count && suitGroups.size > 0) {
    const suit = suits[idx % suits.length];
    const cards = suitGroups.get(suit);
    
    if (cards && cards.length > 0) {
      const sorted = [...cards].sort(sortByRank);
      candidates.push(sorted[0]);
      cards.splice(cards.indexOf(sorted[0]), 1);
      
      if (cards.length === 0) {
        suitGroups.delete(suit);
      }
    }
    
    idx++;
  }
  
  // 如果非主牌单牌不够，从主牌单牌中选择最小的
  if (candidates.length < count) {
    const sorted = [...trumpSingles].sort(sortByRank);
    candidates.push(...sorted.slice(0, count - candidates.length));
  }
  
  // 如果还不够，从availableCards中随机选择（按从小到大）
  if (candidates.length < count) {
    const remaining = availableCards.filter(c => 
      !candidates.some(can => can.id === c.id)
    );
    const sorted = [...remaining].sort(sortByRank);
    candidates.push(...sorted.slice(0, count - candidates.length));
  }
  
  return candidates;
}

// 测试
if (import.meta.main) {
  const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
  const hand: Card[] = [
    { id: 0, joker: 'small' },
    { id: 1, joker: 'small' },
    { id: 2, suit: 'diamond', rank: '2' },
    { id: 3, suit: 'spade', rank: 'A' },
    { id: 4, suit: 'spade', rank: 'K' },
    { id: 5, suit: 'club', rank: '9' },
    { id: 6, suit: 'club', rank: '8' },
    { id: 7, suit: 'club', rank: '7' },
    { id: 8, suit: 'diamond', rank: '6' },
    { id: 9, suit: 'diamond', rank: '5' },
    { id: 10, suit: 'heart', rank: '4' },
    { id: 11, suit: 'heart', rank: '3' },
  ];
  
  console.log('手牌:');
  console.log(hand.map(c => {
    if (c.joker) return c.joker === 'big' ? '大王' : '小王';
    return `${SUIT_NAMES[c.suit!]}${c.rank}`;
  }).join(' '));
  
  console.log('\n扣掉的牌:');
  const discarded = smartDiscardKitty(hand, ctx, 6);
  console.log(discarded.map(c => {
    if (c.joker) return c.joker === 'big' ? '大王' : '小王';
    return `${SUIT_NAMES[c.suit!]}${c.rank}`;
  }).join(' '));
}
