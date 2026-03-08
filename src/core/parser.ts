// M2: 牌型识别与解析

import type { Card, GameContext, Component, ParseResult, CombType } from './types';
import { classifyCard, isAdjacent, getCardKey, countCards, isTrump } from './deck';

/**
 * 解析一组牌为牌型组件列表（贪心算法）
 * 优先级：超级拖拉机 > 三张 > 拖拉机 > 对子 > 单牌
 */
export function parseCards(cards: Card[], ctx: GameContext): ParseResult {
  if (cards.length === 0) return [];

  const result: ParseResult = [];
  const remaining = [...cards];

  // 按门分组（主牌或某花色副牌）
  const groups = groupBySuit(remaining, ctx);

  for (const group of groups) {
    parseGroup(group, ctx, result);
  }

  return result;
}

/**
 * 按门分组（主牌或某花色副牌）
 */
function groupBySuit(cards: Card[], ctx: GameContext): Card[][] {
  const groups = new Map<string, Card[]>();

  for (const card of cards) {
    const classInfo = classifyCard(card, ctx);
    const key = classInfo === 'trump' ? 'trump' : classInfo.suit;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(card);
  }

  return Array.from(groups.values());
}

/**
 * 解析同一门的牌
 */
function parseGroup(cards: Card[], ctx: GameContext, result: ParseResult): void {
  if (cards.length === 0) return;

  // 统计每张牌的张数
  const counts = countCards(cards);
  let remaining = [...cards];

  // 1. 找最长超级拖拉机（连续≥2个三张）
  const superTractors = findSuperTractors(remaining, ctx, counts);
  for (const st of superTractors) {
    result.push(st);
    removeCards(remaining, st.cards);
  }

  // 更新剩余牌
  counts.clear();
  for (const card of remaining) {
    const key = getCardKey(card);
    if (!counts.has(key)) {
      counts.set(key, []);
    }
    counts.get(key)!.push(card);
  }

  // 2. 找剩余三张
  const triples = findTriples(remaining, counts);
  for (const triple of triples) {
    result.push(triple);
    removeCards(remaining, triple.cards);
  }

  // 更新统计
  counts.clear();
  for (const card of remaining) {
    const key = getCardKey(card);
    if (!counts.has(key)) {
      counts.set(key, []);
    }
    counts.get(key)!.push(card);
  }

  // 3. 找最长拖拉机（连续≥2个对子）
  const tractors = findTractors(remaining, ctx, counts);
  for (const tractor of tractors) {
    result.push(tractor);
    removeCards(remaining, tractor.cards);
  }

  // 更新统计
  counts.clear();
  for (const card of remaining) {
    const key = getCardKey(card);
    if (!counts.has(key)) {
      counts.set(key, []);
    }
    counts.get(key)!.push(card);
  }

  // 4. 找剩余对子
  const pairs = findPairs(remaining, counts);
  for (const pair of pairs) {
    result.push(pair);
    removeCards(remaining, pair.cards);
  }

  // 5. 剩余为单牌
  for (const card of remaining) {
    result.push({ type: 'single', cards: [card] });
  }
}

/**
 * 找超级拖拉机（连续≥2个三张）
 */
function findSuperTractors(cards: Card[], ctx: GameContext, counts: Map<string, Card[]>): Component[] {
  const result: Component[] = [];
  
  // 找出所有三张
  const tripleCards: Card[][] = [];
  for (const [key, cardList] of counts) {
    if (cardList.length >= 3) {
      // 可以形成三张
      tripleCards.push(cardList.slice(0, 3));
    }
  }

  if (tripleCards.length < 2) return result;

  // 按大小排序（找相邻的）
  // 简化处理：贪心找最长的连续三张
  const sorted = tripleCards.sort((a, b) => {
    // 同门比较
    const aClass = classifyCard(a[0], ctx);
    const bClass = classifyCard(b[0], ctx);
    
    if (aClass === 'trump' && bClass === 'trump') {
      // 主牌比较
      return compareTrumpCards(a[0], b[0], ctx);
    }
    
    // 副牌比较（假设同门）
    return compareSuitCards(a[0], b[0], ctx);
  });

  // 找连续的三张
  let currentChain: Card[][] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = currentChain[currentChain.length - 1][0];
    const curr = sorted[i][0];
    
    if (isAdjacent(prev, curr, ctx)) {
      currentChain.push(sorted[i]);
    } else {
      // 保存当前链
      if (currentChain.length >= 2) {
        const allCards = currentChain.flatMap(c => c);
        result.push({
          type: 'super_tractor',
          cards: allCards,
          length: currentChain.length
        });
      }
      currentChain = [sorted[i]];
    }
  }
  
  // 保存最后一组
  if (currentChain.length >= 2) {
    const allCards = currentChain.flatMap(c => c);
    result.push({
      type: 'super_tractor',
      cards: allCards,
      length: currentChain.length
    });
  }

  return result;
}

/**
 * 找三张
 */
function findTriples(cards: Card[], counts: Map<string, Card[]>): Component[] {
  const result: Component[] = [];
  
  for (const [key, cardList] of counts) {
    if (cardList.length >= 3) {
      // 形成三张
      const tripleCards = cardList.slice(0, 3);
      result.push({ type: 'triple', cards: tripleCards });
    }
  }

  return result;
}

/**
 * 找拖拉机（连续≥2个对子）
 */
function findTractors(cards: Card[], ctx: GameContext, counts: Map<string, Card[]>): Component[] {
  const result: Component[] = [];
  
  // 找出所有对子
  const pairCards: Card[][] = [];
  for (const [key, cardList] of counts) {
    if (cardList.length >= 2) {
      // 可以形成对子
      pairCards.push(cardList.slice(0, 2));
    }
  }

  if (pairCards.length < 2) return result;

  // 按大小排序（同门内）
  const grouped = new Map<string, Card[][]>();
  
  for (const pair of pairCards) {
    const classInfo = classifyCard(pair[0], ctx);
    const key = classInfo === 'trump' ? 'trump' : classInfo.suit;
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(pair);
  }

  // 在每个门内找连续对子
  for (const [key, pairs] of grouped) {
    const sorted = pairs.sort((a, b) => {
      if (key === 'trump') {
        return compareTrumpCards(a[0], b[0], ctx);
      }
      return compareSuitCards(a[0], b[0], ctx);
    });

    // 找连续的对子
    let currentChain: Card[][] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = currentChain[currentChain.length - 1][0];
      const curr = sorted[i][0];
      
      if (isAdjacent(prev, curr, ctx)) {
        currentChain.push(sorted[i]);
      } else {
        // 保存当前链
        if (currentChain.length >= 2) {
          const allCards = currentChain.flatMap(c => c);
          result.push({
            type: 'tractor',
            cards: allCards,
            length: currentChain.length
          });
        }
        currentChain = [sorted[i]];
      }
    }
    
    // 保存最后一组
    if (currentChain.length >= 2) {
      const allCards = currentChain.flatMap(c => c);
      result.push({
        type: 'tractor',
        cards: allCards,
        length: currentChain.length
      });
    }
  }

  return result;
}

/**
 * 找对子
 */
function findPairs(cards: Card[], counts: Map<string, Card[]>): Component[] {
  const result: Component[] = [];
  
  for (const [key, cardList] of counts) {
    if (cardList.length >= 2) {
      // 形成对子
      const pairCards = cardList.slice(0, 2);
      result.push({ type: 'pair', cards: pairCards });
    }
  }

  return result;
}

/**
 * 从牌列表中移除指定的牌
 */
function removeCards(cards: Card[], toRemove: Card[]): void {
  // Filter out undefined/null cards from toRemove
  const validToRemove = toRemove.filter(c => c != null);
  const removeIds = new Set(validToRemove.map(c => c.id));
  let i = 0;
  while (i < cards.length) {
    // Skip undefined cards in the cards array
    if (!cards[i]) {
      cards.splice(i, 1);
      continue;
    }
    if (removeIds.has(cards[i].id)) {
      cards.splice(i, 1);
    } else {
      i++;
    }
  }
}

/**
 * 比较两张主牌大小
 */
function compareTrumpCards(a: Card, b: Card, ctx: GameContext): number {
  const aVal = getTrumpRankValue(a, ctx);
  const bVal = getTrumpRankValue(b, ctx);
  return bVal - aVal; // 降序
}

/**
 * 比较两张副牌大小（假设同门）
 */
function compareSuitCards(a: Card, b: Card, ctx: GameContext): number {
  const aVal = getSuitRankValue(a, ctx);
  const bVal = getSuitRankValue(b, ctx);
  return bVal - aVal; // 降序
}

/**
 * 获取主牌的排序值（用于比较）
 */
function getTrumpRankValue(card: Card, ctx: GameContext): number {
  if (card.joker === 'big') return 100;
  if (card.joker === 'small') return 99;
  
  if (card.rank === ctx.level) {
    if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) {
      return 98; // 主花色级牌
    }
    return 97; // 其他花色级牌
  }
  
  // 主花色A到2
  const rankValues: Record<Rank, number> = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  
  return rankValues[card.rank!] - 1; // 1-13
}

/**
 * 获取副牌的排序值（用于比较）
 */
function getSuitRankValue(card: Card, ctx: GameContext): number {
  const rankValues: Record<Rank, number> = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  
  if (card.rank === ctx.level) {
    return 15; // 级牌不在副牌中，但给一个高值
  }
  
  return rankValues[card.rank!];
}

/**
 * 判断一组牌是否都是同门
 */
export function isSameSuit(cards: Card[], ctx: GameContext): boolean {
  if (cards.length === 0) return true;
  
  // 检查是否有无效的card
  for (const card of cards) {
    if (!card || (!card.suit && !card.joker)) {
      return false; // 无效的card
    }
  }
  
  const firstClass = classifyCard(cards[0], ctx);
  
  for (const card of cards.slice(1)) {
    const cardClass = classifyCard(card, ctx);
    
    if (firstClass === 'trump') {
      if (cardClass !== 'trump') return false;
    } else {
      if (cardClass === 'trump') return false;
      if ((cardClass as { suit: string }).suit !== (firstClass as { suit: string }).suit) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * 获取一组牌的门（主牌或花色）
 */
export function getPlaySuit(cards: Card[], ctx: GameContext): 'trump' | Suit | null {
  if (cards.length === 0) return null;
  
  const firstClass = classifyCard(cards[0], ctx);
  
  if (firstClass === 'trump') {
    return 'trump';
  }
  
  return (firstClass as { suit: Suit }).suit;
}
