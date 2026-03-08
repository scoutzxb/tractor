// 智能扣底牌策略（简化版）- 按大小排序扣牌，不考虑分数牌

import type { Card, GameContext, Suit } from '../core/types';
import { parseCards } from '../core/parser';
import { isTrump, SUIT_NAMES } from '../core/deck';

// 牌点值（用于排序）
const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export function smartDiscardKitty(
  hand: Card[],
  ctx: GameContext,
  count: number = 6
): Card[] {
  const components = parseCards(hand, ctx);
  
  const singleCards: Card[] = [];
  const pairCards: Card[] = [];
  const comboCards: Card[] = [];
  
  for (const comp of components) {
    if (comp.type === 'single') {
      singleCards.push(comp.cards[0]);
    } else if (comp.type === 'pair') {
      pairCards.push(...comp.cards);
    } else {
      comboCards.push(...comp.cards);
    }
  }

  const suitPriority: Record<Suit, number> = {
    'spade': 4,
    'heart': 3,
    'club': 2,
    'diamond': 1
  };

  const sortBySmallFirst = (a: Card, b: Card) => {
    const av = RANK_VALUES[a.rank!] || 0;
    const bv = RANK_VALUES[b.rank!] || 0;
    if (av !== bv) return av - bv;
    return suitPriority[a.suit!] - suitPriority[b.suit!];
  };
  
  const nonTrumpSingles = singleCards.filter(c => {
    if (c.joker) return false;
    if (c.rank === ctx.level) return false;
    if (ctx.trumpSuit && c.suit === ctx.trumpSuit) return false;
    return true;
  }).sort(sortBySmallFirst);
  
  const candidates: Card[] = [];

  // 1) 直接取最小的非主单牌（不分散花色）
  candidates.push(...nonTrumpSingles.slice(0, count));
  
  // 2) 还不够，再取最小的主花色单牌（不含王和级牌）
  if (candidates.length < count) {
    const trumpSingles = singleCards.filter(c => {
      if (c.joker) return false;
      if (c.rank === ctx.level) return false;
      return !!(ctx.trumpSuit && c.suit === ctx.trumpSuit);
    }).sort(sortBySmallFirst);

    candidates.push(...trumpSingles.slice(0, count - candidates.length));
  }
  
  // 3) 还不够，最后才从对子拆最小牌
  if (candidates.length < count && pairCards.length > 0) {
    pairCards.sort(sortBySmallFirst);
    candidates.push(...pairCards.slice(0, count - candidates.length));
  }
  
  return candidates.slice(0, count);
}
