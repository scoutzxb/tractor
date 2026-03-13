// 智能扣底牌策略（简化版）- 按大小排序扣牌，不考虑分数牌

import type { Card, GameContext, Suit, Seat } from '../core/types';
import { parseCards } from '../core/parser';
import { isTrump, SUIT_NAMES } from '../core/deck';
import { getPartner } from '../core/scoring';

// 牌点值（用于排序）
const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 分牌（5=5分, 10=10分, K=10分）
const SCORE_RANKS = ['5', '10', 'K'];
const SCORE_RANK_VALUES: Record<string, number> = {
  '5': 5,
  '10': 10,
  'K': 10
};

/**
 * 判断是否为分牌
 */
function isScoreCard(card: Card): boolean {
  return card.rank !== undefined && SCORE_RANKS.includes(card.rank);
}

/**
 * 判断是否为非主牌
 */
function isNonTrump(card: Card, ctx: GameContext): boolean {
  if (card.joker) return false;
  if (card.rank === ctx.level) return false;
  if (ctx.trumpSuit && card.suit === ctx.trumpSuit) return false;
  return true;
}

/**
 * 判断玩家是否在庄家组
 */
function isInDealerGroup(seat: Seat, dealer: Seat): boolean {
  return seat === dealer || seat === getPartner(dealer);
}

export function smartDiscardKitty(
  hand: Card[],
  ctx: GameContext,
  count: number = 6
): Card[] {
  // 默认使用原版逻辑（向后兼容）
  return smartDiscardKittyWithDealerInfo(hand, ctx, count, 'east', 'east');
}

/**
 * 智能扣底策略（带庄家信息）
 * 当AI不在庄家组时，优先扣非主分牌（不破坏结构）
 */
export function smartDiscardKittyWithDealerInfo(
  hand: Card[],
  ctx: GameContext,
  count: number,
  seat: Seat,
  dealer: Seat
): Card[] {
  const components = parseCards(hand, ctx);
  
  // 分类组件
  const singleCards: Card[] = [];
  const pairCards: Card[] = [];
  const tripleCards: Card[] = [];
  const tractorCards: Card[] = [];
  
  for (const comp of components) {
    if (comp.type === 'single') {
      singleCards.push(comp.cards[0]);
    } else if (comp.type === 'pair') {
      pairCards.push(...comp.cards);
    } else if (comp.type === 'triple') {
      tripleCards.push(...comp.cards);
    } else if (comp.type === 'tractor' || comp.type === 'super_tractor') {
      tractorCards.push(...comp.cards);
    }
  }

  const suitPriority: Record<Suit, number> = {
    'spade': 4,
    'heart': 3,
    'club': 2,
    'diamond': 1
  };

  // 按点数从小到大，花色从大到小排序
  const sortBySmallFirst = (a: Card, b: Card) => {
    const av = RANK_VALUES[a.rank!] || 0;
    const bv = RANK_VALUES[b.rank!] || 0;
    if (av !== bv) return av - bv;
    return suitPriority[a.suit!] - suitPriority[b.suit!];
  };

  // 分牌按分值从小到大排序（5分优先于10分）
  const sortScoreBySmallFirst = (a: Card, b: Card) => {
    const av = SCORE_RANK_VALUES[a.rank!] || 0;
    const bv = SCORE_RANK_VALUES[b.rank!] || 0;
    if (av !== bv) return av - bv;
    return suitPriority[a.suit!] - suitPriority[b.suit!];
  };

  const candidates: Card[] = [];

  // 如果不在庄家组，优先扣非主分牌（不破坏结构）
  if (!isInDealerGroup(seat, dealer)) {
    // 1) 优先选择非主单张分牌（不破坏对子/拖拉机结构）
    const nonTrumpScoreSingles = singleCards.filter(c => {
      return isNonTrump(c, ctx) && isScoreCard(c);
    }).sort(sortScoreBySmallFirst);
    
    candidates.push(...nonTrumpScoreSingles.slice(0, count));
    
    // 2) 如果还不够，选择非主非分单牌（从小到大）
    if (candidates.length < count) {
      const nonTrumpNonScoreSingles = singleCards.filter(c => {
        return isNonTrump(c, ctx) && !isScoreCard(c);
      }).sort(sortBySmallFirst);
      
      candidates.push(...nonTrumpNonScoreSingles.slice(0, count - candidates.length));
    }
    
    // 3) 如果还不够，选择主花色单牌（不含王和级牌）
    if (candidates.length < count) {
      const trumpSingles = singleCards.filter(c => {
        if (c.joker) return false;
        if (c.rank === ctx.level) return false;
        return !!(ctx.trumpSuit && c.suit === ctx.trumpSuit);
      }).sort(sortBySmallFirst);

      candidates.push(...trumpSingles.slice(0, count - candidates.length));
    }
    
    // 4) 最后才从对子拆（优先拆分牌对子，再拆非分牌对子）
    if (candidates.length < count && pairCards.length > 0) {
      // 按点数从小到大排序
      pairCards.sort(sortBySmallFirst);
      candidates.push(...pairCards.slice(0, count - candidates.length));
    }
  } else {
    // 在庄家组：使用原有逻辑（优先扣小牌，保留分牌）
    
    const nonTrumpSingles = singleCards.filter(c => {
      if (c.joker) return false;
      if (c.rank === ctx.level) return false;
      if (ctx.trumpSuit && c.suit === ctx.trumpSuit) return false;
      return true;
    }).sort(sortBySmallFirst);

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
  }
  
  return candidates.slice(0, count);
}
