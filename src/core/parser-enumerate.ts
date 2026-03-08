// M2: 牌型识别与解析 - 枚举版本
// 不使用贪心算法，显示所有可能的高级牌型组合

import type { Card, GameContext, Component, ParseResult } from './types';
import { classifyCard, isAdjacent, getCardKey, countCards, isTrump } from './deck';

/**
 * 解析结果（枚举版本）
 * 包含所有可能的牌型组合
 */
export interface EnumerateResult {
  superTractors: Component[][];  // 所有可能的超级拖拉机组合
  triples: Component[];          // 所有可能的三张
  tractors: Component[][];       // 所有可能的拖拉机组合（按长度分组）
  pairs: Component[];            // 所有可能的对子
  singles: Card[];               // 单牌（剩余未组合的牌）
}

/**
 * 枚举所有可能的牌型组合
 */
export function enumerateCards(cards: Card[], ctx: GameContext): EnumerateResult {
  if (cards.length === 0) {
    return {
      superTractors: [],
      triples: [],
      tractors: [],
      pairs: [],
      singles: []
    };
  }

  const result: EnumerateResult = {
    superTractors: [],
    triples: [],
    tractors: [],
    pairs: [],
    singles: []
  };

  // 按门分组（主牌或某花色副牌）
  const groups = groupBySuit(cards, ctx);

  for (const group of groups) {
    enumerateGroup(group, ctx, result);
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
 * 枚举同一门的所有可能牌型组合
 */
function enumerateGroup(cards: Card[], ctx: GameContext, result: EnumerateResult): void {
  if (cards.length === 0) return;

  // 统计每张牌的张数
  const counts = countCards(cards);

  // 1. 找所有三张
  const allTriples: Component[] = [];
  for (const [key, cardList] of counts) {
    if (cardList.length >= 3) {
      allTriples.push({ type: 'triple', cards: cardList.slice(0, 3) });
    }
  }
  result.triples.push(...allTriples);

  // 2. 找所有可能的超级拖拉机（从三张中找连续的）
  if (allTriples.length >= 2) {
    const superTractorChains = findAllSuperTractorChains(allTriples, ctx);
    result.superTractors.push(...superTractorChains);
  }

  // 3. 找所有对子
  const allPairs: Component[] = [];
  for (const [key, cardList] of counts) {
    if (cardList.length >= 2) {
      allPairs.push({ type: 'pair', cards: cardList.slice(0, 2) });
    }
  }
  result.pairs.push(...allPairs);

  // 4. 找所有可能的拖拉机（从对子中找连续的）
  if (allPairs.length >= 2) {
    const tractorChains = findAllTractorChains(allPairs, ctx);
    result.tractors.push(...tractorChains);
  }
}

/**
 * 找所有可能的超级拖拉机链
 * 返回所有长度的连续三张组合
 */
function findAllSuperTractorChains(triples: Component[], ctx: GameContext): Component[][] {
  // 按大小排序
  const sorted = [...triples].sort((a, b) => {
    const aClass = classifyCard(a.cards[0], ctx);
    const bClass = classifyCard(b.cards[0], ctx);
    
    if (aClass === 'trump' && bClass === 'trump') {
      return compareTrumpCards(b.cards[0], a.cards[0], ctx);
    }
    return compareSuitCards(b.cards[0], a.cards[0], ctx);
  });

  // 找所有可能的连续链
  const allChains: Component[][] = [];

  // 使用滑动窗口找所有长度的链
  for (let start = 0; start < sorted.length; start++) {
    for (let end = start + 2; end <= sorted.length; end++) {
      // 检查从start到end是否形成连续链
      const chain = sorted.slice(start, end);
      if (isConsecutiveChain(chain, ctx)) {
        // 将三张组合转换为超级拖拉机
        const superTractors = chain.map(triple => ({
          type: 'super_tractor' as const,
          cards: triple.cards,
          length: chain.length
        }));
        allChains.push(superTractors);
      }
    }
  }

  return allChains;
}

/**
 * 找所有可能的拖拉机链
 * 返回所有长度的连续对子组合
 */
function findAllTractorChains(pairs: Component[], ctx: GameContext): Component[][] {
  // 按门分组
  const grouped = new Map<string, Component[]>();
  
  for (const pair of pairs) {
    const classInfo = classifyCard(pair.cards[0], ctx);
    const key = classInfo === 'trump' ? 'trump' : classInfo.suit;
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(pair);
  }

  const allChains: Component[][] = [];

  // 在每个门内找连续对子
  for (const [key, groupPairs] of grouped) {
    // 按大小排序
    const sorted = [...groupPairs].sort((a, b) => {
      if (key === 'trump') {
        return compareTrumpCards(b.cards[0], a.cards[0], ctx);
      }
      return compareSuitCards(b.cards[0], a.cards[0], ctx);
    });

    // 使用滑动窗口找所有长度的链
    for (let start = 0; start < sorted.length; start++) {
      for (let end = start + 2; end <= sorted.length; end++) {
        // 检查从start到end是否形成连续链
        const chain = sorted.slice(start, end);
        if (isConsecutiveChain(chain, ctx)) {
          // 将对子组合转换为拖拉机
          const tractors = chain.map(pair => ({
            type: 'tractor' as const,
            cards: pair.cards,
            length: chain.length
          }));
          allChains.push(tractors);
        }
      }
    }
  }

  return allChains;
}

/**
 * 检查一组牌是否形成连续链
 */
function isConsecutiveChain(components: Component[], ctx: GameContext): boolean {
  if (components.length < 2) return false;

  for (let i = 0; i < components.length - 1; i++) {
    const curr = components[i].cards[0];
    const next = components[i + 1].cards[0];
    
    if (!isAdjacent(curr, next, ctx)) {
      return false;
    }
  }

  return true;
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
  const rankValues: Record<string, number> = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  
  return rankValues[card.rank!] - 1; // 1-13
}

/**
 * 获取副牌的排序值（用于比较）
 */
function getSuitRankValue(card: Card, ctx: GameContext): number {
  const rankValues: Record<string, number> = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  
  if (card.rank === ctx.level) {
    return 15; // 级牌不在副牌中，但给一个高值
  }
  
  return rankValues[card.rank!];
}

/**
 * 格式化枚举结果为易读的字符串
 */
export function formatEnumerateResult(result: EnumerateResult, ctx: GameContext): string {
  const lines: string[] = [];
  const suitNames: Record<string, string> = {
    spade: '♠', heart: '♥', club: '♣', diamond: '♦'
  };

  function formatCard(card: Card): string {
    if (card.joker) return card.joker === 'big' ? '大王' : '小王';
    return `${suitNames[card.suit!]}${card.rank}`;
  }

  function formatCards(cards: Card[]): string {
    return cards.map(formatCard).join(' ');
  }

  // 超级拖拉机
  if (result.superTractors.length > 0) {
    lines.push('【超级拖拉机】');
    // 按长度分组显示
    const byLength = new Map<number, Component[][]>();
    for (const chain of result.superTractors) {
      const len = chain.length;
      if (!byLength.has(len)) byLength.set(len, []);
      byLength.get(len)!.push(chain);
    }
    
    for (const [len, chains] of byLength) {
      lines.push(`  ${len}连:`);
      for (const chain of chains) {
        const cards = chain.flatMap(st => st.cards);
        lines.push(`    ${formatCards(cards)}`);
      }
    }
  }

  // 三张
  if (result.triples.length > 0) {
    lines.push('【三张】');
    for (const triple of result.triples) {
      lines.push(`  ${formatCards(triple.cards)}`);
    }
  }

  // 拖拉机
  if (result.tractors.length > 0) {
    lines.push('【拖拉机】');
    // 按长度分组显示
    const byLength = new Map<number, Component[][]>();
    for (const chain of result.tractors) {
      const len = chain.length;
      if (!byLength.has(len)) byLength.set(len, []);
      byLength.get(len)!.push(chain);
    }
    
    for (const [len, chains] of byLength) {
      lines.push(`  ${len}连:`);
      for (const chain of chains) {
        const cards = chain.flatMap(t => t.cards);
        lines.push(`    ${formatCards(cards)}`);
      }
    }
  }

  // 对子
  if (result.pairs.length > 0) {
    lines.push('【对子】');
    for (const pair of result.pairs) {
      lines.push(`  ${formatCards(pair.cards)}`);
    }
  }

  // 单牌
  if (result.singles.length > 0) {
    lines.push(`【单牌】 ${result.singles.length}张`);
    lines.push(`  ${formatCards(result.singles)}`);
  }

  return lines.join('\n');
}
