// M5: 杀牌校验

import type { Card, GameContext, Component, ParseResult, Seat } from './types';
import { parseCards, isSameSuit, getPlaySuit } from './parser';
import { classifyCard, countCards, isTrump, cardCompare } from './deck';

/**
 * 杀牌校验结果
 */
export interface KillValidationResult {
  valid: boolean;
  reason?: string;
  killStructure?: ParseResult;
}

/**
 * 校验杀牌是否合法
 */
export function validateKill(
  leadCards: Card[],
  killCards: Card[],
  ctx: GameContext
): KillValidationResult {
  // 1. 杀牌必须全是主牌
  const allTrump = killCards.every(card => isTrump(card, ctx));
  if (!allTrump) {
    return { valid: false, reason: '杀牌必须全是主牌' };
  }

  // 2. 张数应该已经由垫牌校验保证，这里不再检查
  
  // 3. 解析首家出牌和杀牌结构
  const leadStructure = parseCards(leadCards, ctx);
  const killStructure = parseCards(killCards, ctx);
  
  // 4. 检查结构是否匹配
  const matchResult = checkStructureMatch(leadStructure, killStructure);
  
  if (matchResult) {
    return { valid: true, killStructure };
  } else {
    return { valid: false, reason: '杀牌结构不匹配', killStructure };
  }
}

/**
 * 检查杀牌结构是否匹配首家出牌结构
 * 规则：
 * - 精确匹配：单张→单张，对子→对子，拖拉机(n)→拖拉机(n)等
 * - 高阶包含：拖拉机→可杀两对子，三张→可杀一对+一单等
 */
function checkStructureMatch(leadStructure: ParseResult, killStructure: ParseResult): boolean {
  // 统计首家各类型数量
  const leadCounts = {
    superTractor: 0,
    triple: 0,
    tractor: 0,
    pair: 0,
    single: 0
  };
  
  for (const comp of leadStructure) {
    switch (comp.type) {
      case 'super_tractor':
        leadCounts.superTractor += comp.length || 2;
        break;
      case 'triple':
        leadCounts.triple++;
        break;
      case 'tractor':
        leadCounts.tractor += comp.length || 2;
        break;
      case 'pair':
        leadCounts.pair++;
        break;
      case 'single':
        leadCounts.single++;
        break;
    }
  }
  
  // 统计杀牌各类型数量
  const killCounts = {
    superTractor: 0,
    triple: 0,
    tractor: 0,
    pair: 0,
    single: 0
  };
  
  for (const comp of killStructure) {
    switch (comp.type) {
      case 'super_tractor':
        killCounts.superTractor += comp.length || 2;
        break;
      case 'triple':
        killCounts.triple++;
        break;
      case 'tractor':
        killCounts.tractor += comp.length || 2;
        break;
      case 'pair':
        killCounts.pair++;
        break;
      case 'single':
        killCounts.single++;
        break;
    }
  }
  
  // 检查能否通过高阶包含匹配
  return canKillByInclusion(leadCounts, killCounts, leadStructure, killStructure);
}

/**
 * 检查是否能通过高阶包含匹配
 * 规则：
 * - 超级拖拉机(n) 可杀 n个三张 或 混合结构
 * - 三张 可杀 1对+1单
 * - 拖拉机(n) 可杀 n个对子
 * - 对子 可杀 2个单牌（但这不符合规则，对子只能杀对子）
 */
function canKillByInclusion(
  leadCounts: { superTractor: number; triple: number; tractor: number; pair: number; single: number },
  killCounts: { superTractor: number; triple: number; tractor: number; pair: number; single: number },
  leadStructure: ParseResult,
  killStructure: ParseResult
): boolean {
  // 复制用于计算
  const lead = { ...leadCounts };
  const kill = { ...killCounts };
  
  // 1. 超级拖拉机匹配
  if (lead.superTractor > 0) {
    if (kill.superTractor >= lead.superTractor) {
      kill.superTractor -= lead.superTractor;
      lead.superTractor = 0;
    } else {
      return false;
    }
  }
  
  // 2. 三张匹配（超级拖拉机可拆成三张）
  if (lead.triple > 0) {
    // 优先用三张匹配
    const matchByTriple = Math.min(kill.triple, lead.triple);
    kill.triple -= matchByTriple;
    lead.triple -= matchByTriple;
    
    // 不足的用超级拖拉机
    if (lead.triple > 0 && kill.superTractor > 0) {
      const matchByST = Math.min(kill.superTractor, lead.triple);
      kill.superTractor -= matchByST;
      lead.triple -= matchByST;
    }
    
    if (lead.triple > 0) {
      return false;
    }
  }
  
  // 3. 拖拉机匹配
  if (lead.tractor > 0) {
    if (kill.tractor >= lead.tractor) {
      kill.tractor -= lead.tractor;
      lead.tractor = 0;
    } else {
      // 不足的用超级拖拉机（每个超级拖拉机可拆成拖拉机+三张，复杂，简化处理）
      // 或者用三张+对子组合
      return false; // 简化：拖拉机必须用拖拉机杀
    }
  }
  
  // 4. 对子匹配（三张和拖拉机可拆成对子）
  if (lead.pair > 0) {
    // 优先用对子
    const matchByPair = Math.min(kill.pair, lead.pair);
    kill.pair -= matchByPair;
    lead.pair -= matchByPair;
    
    // 不足的用三张（每张三张可拆成1对+1单）
    if (lead.pair > 0 && kill.triple > 0) {
      const matchByTriple = Math.min(kill.triple, lead.pair);
      kill.triple -= matchByTriple;
      kill.single += matchByTriple; // 三张拆成对子后剩单牌
      lead.pair -= matchByTriple;
    }
    
    // 不足的用拖拉机
    if (lead.pair > 0 && kill.tractor > 0) {
      const matchByTractor = Math.min(kill.tractor, lead.pair);
      kill.tractor -= matchByTractor;
      lead.pair -= matchByTractor;
    }
    
    if (lead.pair > 0) {
      return false;
    }
  }
  
  // 5. 单牌匹配
  if (lead.single > 0) {
    const matchBySingle = Math.min(kill.single, lead.single);
    kill.single -= matchBySingle;
    lead.single -= matchBySingle;
    
    // 不足的用对子（对子可拆成单牌）
    if (lead.single > 0 && kill.pair > 0) {
      const matchByPair = Math.min(kill.pair, lead.single);
      kill.pair -= matchByPair;
      kill.single += matchByPair; // 对子拆成单牌
      lead.single -= matchByPair;
    }
    
    // 不足的用三张
    if (lead.single > 0 && kill.triple > 0) {
      const matchByTriple = Math.min(kill.triple, lead.single);
      kill.triple -= matchByTriple;
      kill.single += matchByTriple * 3; // 三张拆成单牌
      lead.single -= matchByTriple;
    }
    
    if (lead.single > 0) {
      return false;
    }
  }
  
  return true;
}

/**
 * 比较两个杀牌的大小
 * 规则：只比较最高阶结构的部分
 */
export function compareKills(
  leadCards: Card[],
  kill1: { cards: Card[]; seat: Seat },
  kill2: { cards: Card[]; seat: Seat },
  ctx: GameContext
): Seat {
  const leadStructure = parseCards(leadCards, ctx);
  const kill1Structure = parseCards(kill1.cards, ctx);
  const kill2Structure = parseCards(kill2.cards, ctx);
  
  // 找首家最高阶结构
  const maxLeadType = findMaxComponentType(leadStructure);
  
  // 找每个杀牌中匹配该类型的部分
  const kill1Max = findMatchingComponent(kill1Structure, maxLeadType);
  const kill2Max = findMatchingComponent(kill2Structure, maxLeadType);
  
  if (!kill1Max && !kill2Max) {
    // 都没有匹配的最高阶结构，比较整体最大牌
    return compareByMaxCard(kill1.cards, kill2.cards, ctx, kill1.seat, kill2.seat);
  }
  
  if (!kill1Max) return kill2.seat;
  if (!kill2Max) return kill1.seat;
  
  // 都有匹配的最高阶结构，比较大小
  const comp = compareComponents(kill1Max, kill2Max, ctx);
  if (comp > 0) return kill1.seat;
  if (comp < 0) return kill2.seat;
  
  // 相等，先出者胜
  return kill1.seat;
}

/**
 * 找最高阶组件类型
 */
function findMaxComponentType(structure: ParseResult): string {
  const priority = ['super_tractor', 'triple', 'tractor', 'pair', 'single'];
  
  for (const type of priority) {
    if (structure.some(comp => comp.type === type)) {
      return type;
    }
  }
  
  return 'single';
}

/**
 * 找匹配指定类型的组件
 */
function findMatchingComponent(structure: ParseResult, targetType: string): Component | null {
  const priority = ['super_tractor', 'triple', 'tractor', 'pair', 'single'];
  const targetIdx = priority.indexOf(targetType);
  
  // 找同级或更高级的组件
  for (let i = 0; i <= targetIdx; i++) {
    const comp = structure.find(c => c.type === priority[i]);
    if (comp) return comp;
  }
  
  return null;
}

/**
 * 比较两个组件的大小
 */
function compareComponents(comp1: Component, comp2: Component, ctx: GameContext): number {
  // 同类型比较最大牌
  const max1 = getMaxCard(comp1.cards, ctx);
  const max2 = getMaxCard(comp2.cards, ctx);
  
  return cardCompare(max1, max2, ctx);
}

/**
 * 获取最大牌
 */
function getMaxCard(cards: Card[], ctx: GameContext): Card {
  if (cards.length === 0) throw new Error('Empty cards');
  
  let max = cards[0];
  for (const card of cards.slice(1)) {
    if (cardCompare(card, max, ctx) > 0) {
      max = card;
    }
  }
  return max;
}

// 需要修复 getMaxCard 中的 ctx 问题
function getMaxCardWithContext(cards: Card[], ctx: GameContext): Card {
  if (cards.length === 0) throw new Error('Empty cards');
  
  let max = cards[0];
  for (const card of cards.slice(1)) {
    if (cardCompare(card, max, ctx) > 0) {
      max = card;
    }
  }
  return max;
}

/**
 * 比较两组牌的最大牌
 */
function compareByMaxCard(cards1: Card[], cards2: Card[], ctx: GameContext, seat1: Seat, seat2: Seat): Seat {
  const max1 = getMaxCardWithContext(cards1, ctx);
  const max2 = getMaxCardWithContext(cards2, ctx);
  
  const comp = cardCompare(max1, max2, ctx);
  if (comp > 0) return seat1;
  if (comp < 0) return seat2;
  return seat1; // 先出者胜
}

/**
 * 判断是否可以杀牌（用于UI提示）
 */
export function canKill(
  leadCards: Card[],
  hand: Card[],
  ctx: GameContext
): boolean {
  // 检查是否有足够的主牌
  const trumpCards = hand.filter(c => isTrump(c, ctx));
  const leadStructure = parseCards(leadCards, ctx);
  const totalLead = leadCards.length;
  
  // 主牌数量不够
  if (trumpCards.length < totalLead) {
    return false;
  }
  
  // 尝试匹配结构
  // 简化：检查是否有足够的各种类型的主牌
  const handStructure = parseCards(trumpCards, ctx);
  
  // 统计首家需要的结构
  const leadCounts = {
    superTractor: 0,
    triple: 0,
    tractor: 0,
    pair: 0,
    single: 0
  };
  
  for (const comp of leadStructure) {
    switch (comp.type) {
      case 'super_tractor':
        leadCounts.superTractor += comp.length || 2;
        break;
      case 'triple':
        leadCounts.triple++;
        break;
      case 'tractor':
        leadCounts.tractor += comp.length || 2;
        break;
      case 'pair':
        leadCounts.pair++;
        break;
      case 'single':
        leadCounts.single++;
        break;
    }
  }
  
  // 统计手牌主牌结构
  const handCounts = {
    superTractor: 0,
    triple: 0,
    tractor: 0,
    pair: 0,
    single: 0
  };
  
  for (const comp of handStructure) {
    switch (comp.type) {
      case 'super_tractor':
        handCounts.superTractor += comp.length || 2;
        break;
      case 'triple':
        handCounts.triple++;
        break;
      case 'tractor':
        handCounts.tractor += comp.length || 2;
        break;
      case 'pair':
        handCounts.pair++;
        break;
      case 'single':
        handCounts.single++;
        break;
    }
  }
  
  // 检查能否通过包含匹配
  return canKillByInclusion(leadCounts, handCounts, leadStructure, handStructure);
}
