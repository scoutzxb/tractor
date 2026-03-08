// M1: 牌库与排序

import type { Card, Suit, Rank, GameContext } from './types';

// 常量定义
export const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 花色显示名称
export const SUIT_NAMES: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦'
};

// 点数大小映射（A最大，2最小）
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

/**
 * 生成162张牌（3副牌，含6张大小王）
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;

  // 3副牌
  for (let deckNum = 0; deckNum < 3; deckNum++) {
    // 每种花色的2-A
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: id++, suit, rank });
      }
    }
    // 大小王各1张
    deck.push({ id: id++, joker: 'big' });
    deck.push({ id: id++, joker: 'small' });
  }

  return deck;
}

/**
 * Seeded random number generator (Linear Congruential Generator)
 */
export function seededRandom(seed: number): () => number {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 洗牌（Fisher-Yates算法）
 */
export function shuffle(deck: Card[], seed?: number): Card[] {
  const shuffled = [...deck];
  const random = seed !== undefined ? seededRandom(seed) : Math.random;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 发牌（每人39张 + 6张底牌）
 */
export function deal(deck: Card[]): { hands: Card[][]; kitty: Card[] } {
  const hands: Card[][] = [[], [], [], []];
  const kitty = deck.slice(156); // 最后6张为底牌

  // 前156张发给4家
  for (let i = 0; i < 156; i++) {
    hands[i % 4].push(deck[i]);
  }

  return { hands, kitty };
}

/**
 * 获取主牌序列（从大到小）
 * 规则：大王 > 小王 > 主花色级牌 > 其他花色级牌（同级） > 主花色A > ... > 主花色2
 */
export function getTrumpOrder(ctx: GameContext): Card[] {
  const order: Card[] = [];
  let id = 0;

  // 3张大王
  for (let i = 0; i < 3; i++) {
    order.push({ id: id++, joker: 'big' });
  }
  // 3张小王
  for (let i = 0; i < 3; i++) {
    order.push({ id: id++, joker: 'small' });
  }

  // 级牌（所有花色的当前级别牌）
  if (ctx.trumpSuit !== null) {
    // 主花色级牌（优先）
    order.push({ id: id++, suit: ctx.trumpSuit, rank: ctx.level });
    order.push({ id: id++, suit: ctx.trumpSuit, rank: ctx.level });
    order.push({ id: id++, suit: ctx.trumpSuit, rank: ctx.level });
    
    // 其他花色级牌（同级，按花色顺序排列但大小相同）
    for (const suit of SUITS) {
      if (suit !== ctx.trumpSuit) {
        order.push({ id: id++, suit, rank: ctx.level });
        order.push({ id: id++, suit, rank: ctx.level });
        order.push({ id: id++, suit, rank: ctx.level });
      }
    }
  } else {
    // 无主局：所有花色的级牌都同级
    for (const suit of SUITS) {
      for (let i = 0; i < 3; i++) {
        order.push({ id: id++, suit, rank: ctx.level });
      }
    }
  }

  // 主花色A到2（跳过级牌）
  if (ctx.trumpSuit !== null) {
    const ranksDescending = RANKS.slice().reverse();
    for (const rank of ranksDescending) {
      if (rank !== ctx.level) {
        for (let i = 0; i < 3; i++) {
          order.push({ id: id++, suit: ctx.trumpSuit, rank });
        }
      }
    }
  }

  return order;
}

/**
 * 获取某花色副牌序列（从大到小，跳过级牌）
 */
export function getSuitOrder(suit: Suit, ctx: GameContext): Card[] {
  const order: Card[] = [];
  let id = 0;

  const ranksDescending = RANKS.slice().reverse();
  for (const rank of ranksDescending) {
    if (rank !== ctx.level) { // 跳过级牌
      for (let i = 0; i < 3; i++) {
        order.push({ id: id++, suit, rank });
      }
    }
  }

  return order;
}

/**
 * 判断一张牌是否为主牌
 */
export function isTrump(card: Card, ctx: GameContext): boolean {
  // Safety check for undefined cards
  if (!card) return false;
  
  // 大小王是主牌
  if (card.joker) return true;

  // 级牌是主牌
  if (card.rank === ctx.level) return true;

  // 主花色的牌是主牌
  if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) return true;

  return false;
}

/**
 * 判断一张牌的归属（主牌或某花色副牌）
 */
export function classifyCard(card: Card, ctx: GameContext): 'trump' | { suit: Suit } {
  // Safety check for undefined cards
  if (!card) return { suit: 'spade' };  // Default to spade
  
  if (isTrump(card, ctx)) {
    return 'trump';
  }
  return { suit: card.suit! };
}

/**
 * 获取牌在主牌序列中的相对位置（用于比较大小）
 * 返回值越大牌越大
 */
export function getTrumpValue(card: Card, ctx: GameContext): number {
  if (card.joker === 'big') return 1000;
  if (card.joker === 'small') return 999;

  if (card.rank === ctx.level) {
    // 级牌：主花色级牌 > 其他花色级牌
    if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) {
      return 998; // 主花色级牌
    }
    return 997; // 其他花色级牌（同级）
  }

  // 主花色牌（A > K > ... > 2，跳过级牌）
  if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) {
    return RANK_VALUES[card.rank!];
  }

  return 0; // 不应该到达这里
}

/**
 * 获取牌在副牌序列中的相对位置
 */
export function getSuitValue(card: Card, ctx: GameContext): number {
  if (card.rank === ctx.level) {
    // 级牌不在副牌序列中，返回负值表示不应该出现
    return -1;
  }
  return RANK_VALUES[card.rank!];
}

/**
 * 比较两张同门牌的大小
 * 返回正数表示 a > b，负数表示 a < b，0表示相等
 */
export function cardCompare(a: Card, b: Card, ctx: GameContext): number {
  const aIsTrump = isTrump(a, ctx);
  const bIsTrump = isTrump(b, ctx);

  // 主牌和副牌不能直接比较
  if (aIsTrump !== bIsTrump) {
    throw new Error('Cannot compare trump and non-trump cards directly');
  }

  if (aIsTrump) {
    return getTrumpValue(a, ctx) - getTrumpValue(b, ctx);
  } else {
    // 同花色副牌比较
    if (a.suit !== b.suit) {
      throw new Error('Cannot compare cards of different suits');
    }
    return getSuitValue(a, ctx) - getSuitValue(b, ctx);
  }
}

/**
 * 判断两张牌是否相邻（用于判断拖拉机）
 * 注意：级牌移除后，前后牌变成相邻
 */
export function isAdjacent(a: Card, b: Card, ctx: GameContext): boolean {
  // 必须同门
  const aClass = classifyCard(a, ctx);
  const bClass = classifyCard(b, ctx);
  
  // 比较对象的值而不是引用
  if (aClass === 'trump' && bClass !== 'trump') return false;
  if (aClass !== 'trump' && bClass === 'trump') return false;
  if (aClass !== 'trump' && bClass !== 'trump') {
    if ((aClass as { suit: Suit }).suit !== (bClass as { suit: Suit }).suit) {
      return false;
    }
  }
  
  // 都是主牌
  if (aClass === 'trump') {
    return isTrumpAdjacent(a, b, ctx);
  }
  
  // 都是同花色副牌
  return isSuitAdjacent(a, b, ctx);
}

/**
 * 判断两张主牌是否相邻
 */
function isTrumpAdjacent(a: Card, b: Card, ctx: GameContext): boolean {
  // 大王和小王相邻
  if ((a.joker === 'big' && b.joker === 'small') || 
      (a.joker === 'small' && b.joker === 'big')) {
    return true;
  }
  
  // 有主花色的局
  if (ctx.trumpSuit !== null) {
    // 小王和主花色级牌相邻
    if (a.joker === 'small' && b.rank === ctx.level && b.suit === ctx.trumpSuit) {
      return true;
    }
    if (b.joker === 'small' && a.rank === ctx.level && a.suit === ctx.trumpSuit) {
      return true;
    }
    
    // 主花色级牌和其他花色级牌相邻
    if (a.rank === ctx.level && a.suit === ctx.trumpSuit && b.rank === ctx.level && b.suit !== ctx.trumpSuit) {
      return true;
    }
    if (b.rank === ctx.level && b.suit === ctx.trumpSuit && a.rank === ctx.level && a.suit !== ctx.trumpSuit) {
      return true;
    }
    
    // 其他花色级牌和主花色A相邻
    if (a.rank === ctx.level && a.suit !== ctx.trumpSuit && b.suit === ctx.trumpSuit && b.rank === 'A') {
      return true;
    }
    if (b.rank === ctx.level && b.suit !== ctx.trumpSuit && a.suit === ctx.trumpSuit && a.rank === 'A') {
      return true;
    }
    
    // 主花色A和K相邻（跳过级牌）
    if (a.suit === ctx.trumpSuit && b.suit === ctx.trumpSuit) {
      return areRanksAdjacent(a.rank!, b.rank!, ctx.level);
    }
  } else {
    // 无主局：小王和任意级牌相邻
    if ((a.joker === 'small' && b.rank === ctx.level) ||
        (b.joker === 'small' && a.rank === ctx.level)) {
      return true;
    }

    // 无主局：不同花色级牌是同级，不算相邻（不能据此组成拖拉机）
    return false;
  }
  
  return false;
}

/**
 * 判断两张副牌是否相邻（考虑级牌移除）
 */
function isSuitAdjacent(a: Card, b: Card, ctx: GameContext): boolean {
  if (a.suit !== b.suit) return false;
  
  // 级牌不在副牌序列中，已经过滤掉了
  return areRanksAdjacent(a.rank!, b.rank!, ctx.level);
}

/**
 * 判断两个点数是否相邻（考虑级牌移除）
 */
function areRanksAdjacent(rankA: Rank, rankB: Rank, level: Rank): boolean {
  // RANKS已经是按从小到大排列：['2', '3', '4', ..., 'A']
  // 我们需要从大到小的排列来检查相邻性
  
  // 创建过滤掉级牌的序列（从大到小）
  const filteredRanks = RANKS.slice().reverse().filter(rank => rank !== level);
  
  const idxA = filteredRanks.indexOf(rankA);
  const idxB = filteredRanks.indexOf(rankB);
  
  // 如果任何一个牌不在序列中（不应该发生），返回false
  if (idxA === -1 || idxB === -1) return false;
  
  return Math.abs(idxA - idxB) === 1;
}

/**
 * 手牌排序（按PRD规则：大王 > 小王 > 主牌 > 副牌黑桃 > 红桃 > 梅花 > 方块）
 */
export function sortHand(hand: Card[], ctx: GameContext): Card[] {
  return hand.sort((a, b) => {
    const aClass = classifyCard(a, ctx);
    const bClass = classifyCard(b, ctx);

    // 主牌在前
    if (aClass === 'trump' && bClass !== 'trump') return -1;
    if (aClass !== 'trump' && bClass === 'trump') return 1;

    // 都是主牌，按主牌序列排序
    if (aClass === 'trump' && bClass === 'trump') {
      return -cardCompare(a, b, ctx); // 大的在前
    }

    // 都是副牌，按花色优先级排序（黑桃 > 红桃 > 梅花 > 方块）
    const suitOrder: Suit[] = ['spade', 'heart', 'club', 'diamond'];
    const aSuitIdx = suitOrder.indexOf((aClass as { suit: Suit }).suit);
    const bSuitIdx = suitOrder.indexOf((bClass as { suit: Suit }).suit);
    
    if (aSuitIdx !== bSuitIdx) {
      return aSuitIdx - bSuitIdx;
    }

    // 同花色，按点数排序（大的在前）
    return -cardCompare(a, b, ctx);
  });
}

/**
 * 统计手牌中每张牌的张数
 */
export function countCards(hand: Card[]): Map<string, Card[]> {
  const counts = new Map<string, Card[]>();
  
  for (const card of hand) {
    // Skip undefined/null cards
    if (!card) continue;
    
    const key = getCardKey(card);
    if (!counts.has(key)) {
      counts.set(key, []);
    }
    counts.get(key)!.push(card);
  }
  
  return counts;
}

/**
 * 获取牌的唯一标识键（用于统计）
 */
export function getCardKey(card: Card): string {
  if (!card) {
    return 'UNKNOWN';
  }
  if (card.joker) {
    return card.joker === 'big' ? 'JOKER_BIG' : 'JOKER_SMALL';
  }
  return `${card.suit}_${card.rank}`;
}

/**
 * 获取牌的显示名称
 */
export function getCardDisplayName(card: Card): string {
  if (card.joker) {
    return card.joker === 'big' ? '大王' : '小王';
  }
  const suitName = SUIT_NAMES[card.suit!];
  return `${suitName}${card.rank}`;
}

/**
 * 获取花色显示名称
 */
export function getSuitDisplayName(suit: Suit): string {
  return SUIT_NAMES[suit];
}
