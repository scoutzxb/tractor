// M3: 甩牌校验

import type { Card, GameContext, Component, ParseResult } from './types';
import { parseCards, isSameSuit, getPlaySuit } from './parser';
import { enumerateCards } from './parser-enumerate';
import { classifyCard, countCards, isTrump, cardCompare } from './deck';

/**
 * 甩牌校验结果
 */
export interface LeadValidationResult {
  valid: boolean;
  failedComponent?: Component;
  reason?: string;
}

/**
 * 校验甩牌是否合法
 */
export function validateLeadPlay(
  cards: Card[],
  otherHands: Card[][],
  ctx: GameContext
): LeadValidationResult {
  // 1. 检查是否同门
  if (!isSameSuit(cards, ctx)) {
    return { valid: false, reason: '甩牌必须全部是同门牌' };
  }

  // 2. 解析出牌
  const parseResult = parseCards(cards, ctx);
  
  // 3. 如果只有1个组件 → 不算甩牌，直接通过
  if (parseResult.length === 1) {
    return { valid: true };
  }

  // 4. 这是甩牌，需要校验
  // 找最小组件（按优先级从低到高：单牌 < 对子 < 拖拉机 < 三张 < 超级拖拉机）
  const playSuit = getPlaySuit(cards, ctx);
  const ordered = sortComponentsForThrowCheck(parseResult, ctx);

  for (const target of ordered) {
    for (const hand of otherHands) {
      const hasBigger = checkHasBiggerStructure(target, hand, playSuit, ctx);
      if (hasBigger) {
        return {
          valid: false,
          failedComponent: target,
          reason: `甩牌失败：存在更大的${getComponentName(target.type)}`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * 找最小组件（按优先级从低到高）
 */
function findMinComponent(components: Component[]): Component {
  const priority = {
    'single': 1,
    'pair': 2,
    'tractor': 3,
    'triple': 4,
    'super_tractor': 5
  };

  // 过滤掉无效的component
  const validComponents = components.filter(c => c && c.type);
  
  if (validComponents.length === 0) {
    return components[0]; // 兜底
  }

  let min = validComponents[0];
  let minPriority = priority[min.type];
  
  for (const comp of validComponents.slice(1)) {
    const compPriority = priority[comp.type];
    if (compPriority < minPriority) {
      min = comp;
      minPriority = compPriority;
    }
  }
  
  return min;
}

/**
 * 检查手牌中是否有更大的同门结构
 */
function checkHasBiggerStructure(
  target: Component,
  hand: Card[],
  playSuit: 'trump' | string | null,
  ctx: GameContext
): boolean {
  // 获取同门牌
  const suitCards = hand.filter(card => {
    const classInfo = classifyCard(card, ctx);
    if (playSuit === 'trump') {
      return classInfo === 'trump';
    }
    return classInfo !== 'trump' && (classInfo as { suit: string }).suit === playSuit;
  });

  if (suitCards.length === 0) return false;

  const enumerated = enumerateCards(suitCards, ctx);

  // 根据目标类型检查
  switch (target.type) {
    case 'single':
      return checkHasBiggerSingle(target, suitCards, ctx);
    case 'pair':
      return checkHasBiggerPair(target, enumerated, ctx);
    case 'tractor':
      return checkHasBiggerTractor(target, enumerated, ctx);
    case 'triple':
      return checkHasBiggerTriple(target, enumerated, ctx);
    case 'super_tractor':
      return checkHasBiggerSuperTractor(target, enumerated, ctx);
    default:
      return false;
  }
}

/**
 * 检查是否有更大的单牌
 */
function checkHasBiggerSingle(target: Component, suitCards: Card[], ctx: GameContext): boolean {
  const targetCard = target.cards[0];
  
  for (const c of suitCards) {
    if (cardCompare(c, targetCard, ctx) > 0) return true;
  }
  
  return false;
}

/**
 * 检查是否有更大的对子
 */
function checkHasBiggerPair(target: Component, enumerated: ReturnType<typeof enumerateCards>, ctx: GameContext): boolean {
  const targetCard = target.cards[0];
  
  for (const pair of enumerated.pairs) {
    if (cardCompare(pair.cards[0], targetCard, ctx) > 0) return true;
  }
  
  return false;
}

/**
 * 检查是否有更大的拖拉机
 */
function checkHasBiggerTractor(target: Component, enumerated: ReturnType<typeof enumerateCards>, ctx: GameContext): boolean {
  const targetLength = target.length || 2;
  const targetMaxCard = getTractorMaxCard(target.cards);
  
  for (const chain of enumerated.tractors) {
    const compLength = chain.length;
    if (compLength >= targetLength) {
      const compMaxCard = getTractorMaxCard(chain.flatMap(c => c.cards));
      if (cardCompare(compMaxCard, targetMaxCard, ctx) > 0) return true;
    }
  }

  for (const chain of enumerated.superTractors) {
    const compLength = chain.length;
    if (compLength >= targetLength) {
      const compMaxCard = getTractorMaxCard(chain.flatMap(c => c.cards));
      if (cardCompare(compMaxCard, targetMaxCard, ctx) > 0) return true;
    }
  }
  
  return false;
}

/**
 * 检查是否有更大的三张
 */
function checkHasBiggerTriple(target: Component, enumerated: ReturnType<typeof enumerateCards>, ctx: GameContext): boolean {
  const targetCard = target.cards[0];
  
  for (const triple of enumerated.triples) {
    if (cardCompare(triple.cards[0], targetCard, ctx) > 0) return true;
  }

  for (const chain of enumerated.superTractors) {
    for (const tri of chain) {
      if (cardCompare(tri.cards[0], targetCard, ctx) > 0) return true;
    }
  }
  
  return false;
}

/**
 * 检查是否有更大的超级拖拉机
 */
function checkHasBiggerSuperTractor(target: Component, enumerated: ReturnType<typeof enumerateCards>, ctx: GameContext): boolean {
  const targetLength = target.length || 2;
  const targetMaxCard = getSuperTractorMaxCard(target.cards);
  
  for (const chain of enumerated.superTractors) {
    const compLength = chain.length;
    if (compLength >= targetLength) {
      const compMaxCard = getSuperTractorMaxCard(chain.flatMap(c => c.cards));
      if (cardCompare(compMaxCard, targetMaxCard, ctx) > 0) return true;
    }
  }
  
  return false;
}

/**
 * 获取拖拉机中最大的牌
 */
function getTractorMaxCard(cards: Card[]): Card {
  // 拖拉机中最大的牌就是第一张（已排序）
  return cards[0];
}

/**
 * 获取超级拖拉机中最大的牌
 */
function getSuperTractorMaxCard(cards: Card[]): Card {
  return cards[0];
}

/**
 * 获取组件名称
 */
function getComponentName(type: string): string {
  const names: Record<string, string> = {
    'single': '单牌',
    'pair': '对子',
    'tractor': '拖拉机',
    'triple': '三张',
    'super_tractor': '超级拖拉机'
  };
  return names[type] || type;
}

function sortComponentsForThrowCheck(components: Component[], ctx: GameContext): Component[] {
  const priority: Record<string, number> = {
    single: 1,
    pair: 2,
    tractor: 3,
    triple: 4,
    super_tractor: 5
  };

  return [...components].sort((a, b) => {
    const pa = priority[a.type] || 99;
    const pb = priority[b.type] || 99;
    if (pa !== pb) return pa - pb;

    // 同类型下先检查更小的组件
    try {
      return cardCompare(a.cards[0], b.cards[0], ctx);
    } catch {
      return 0;
    }
  });
}
