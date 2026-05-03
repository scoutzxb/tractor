// M4: 垫牌校验与自动补选

import type { Card, GameContext, Component, ParseResult } from './types';
import { parseCards, isSameSuit, getPlaySuit } from './parser';
import { enumerateCards } from './parser-enumerate';
import { classifyCard, countCards, isTrump, cardCompare } from './deck';

function deriveLeadComponentsForFollow(leadCards: Card[], ctx: GameContext): ParseResult {
  const enumerated = enumerateCards(leadCards, ctx);
  const total = leadCards.length;

  // 优先识别“整手就是拖拉机/超级拖拉机”的情况
  const fullSuper = enumerated.superTractors
    .filter(chain => chain.length * 3 === total)
    .sort((a, b) => b.length - a.length);
  if (fullSuper.length > 0) {
    return [{
      type: 'super_tractor',
      cards: fullSuper[0].flatMap(c => c.cards),
      length: fullSuper[0].length
    }];
  }

  const fullTractors = enumerated.tractors
    .filter(chain => chain.length * 2 === total)
    .sort((a, b) => b.length - a.length);
  if (fullTractors.length > 0) {
    return [{
      type: 'tractor',
      cards: fullTractors[0].flatMap(c => c.cards),
      length: fullTractors[0].length
    }];
  }

  return parseCards(leadCards, ctx);
}

function pickBestStructuredFollow(leadComponents: ParseResult, suitCards: Card[], ctx: GameContext): Card[] | null {
  if (leadComponents.length !== 1) return null;

  const lead = leadComponents[0];
  const enumerated = enumerateCards(suitCards, ctx);

  if (lead.type === 'tractor') {
    const needLen = lead.length || (lead.cards.length / 2);
    const candidates = enumerated.tractors
      .filter(chain => chain.length >= needLen)
      .map(chain => chain.slice(0, needLen).flatMap(c => c.cards));
    if (candidates.length > 0) {
      candidates.sort((a, b) => cardCompare(a[0], b[0], ctx));
      return candidates[0];
    }
  }

  if (lead.type === 'super_tractor') {
    const needLen = lead.length || (lead.cards.length / 3);
    const candidates = enumerated.superTractors
      .filter(chain => chain.length >= needLen)
      .map(chain => chain.slice(0, needLen).flatMap(c => c.cards));
    if (candidates.length > 0) {
      candidates.sort((a, b) => cardCompare(a[0], b[0], ctx));
      return candidates[0];
    }
  }

  if (lead.type === 'triple' && enumerated.triples.length > 0) {
    const triples = [...enumerated.triples].sort((a, b) => cardCompare(a.cards[0], b.cards[0], ctx));
    return triples[0].cards;
  }

  if (lead.type === 'pair' && enumerated.pairs.length > 0) {
    const pairs = [...enumerated.pairs].sort((a, b) => cardCompare(a.cards[0], b.cards[0], ctx));
    return pairs[0].cards;
  }

  return null;
}

function maxChainLength(chains: Component[][]): number {
  return chains.reduce((max, chain) => Math.max(max, chain.length), 0);
}

function countTriplesFromCards(cards: Card[]): number {
  let triples = 0;
  for (const list of countCards(cards).values()) {
    if (list.length >= 3) triples += 1;
  }
  return triples;
}

function getLeadRequiredTripleSlots(leadComponents: ParseResult): number {
  let slots = 0;
  for (const comp of leadComponents) {
    if (comp.type === 'triple') {
      slots += 1;
    } else if (comp.type === 'super_tractor') {
      slots += comp.length || Math.floor(comp.cards.length / 3);
    }
  }
  return slots;
}

function maxTractorChainLengthInCards(cards: Card[], ctx: GameContext): number {
  return maxChainLength(enumerateCards(cards, ctx).tractors);
}

function maxSuperTractorChainLengthInCards(cards: Card[], ctx: GameContext): number {
  return maxChainLength(enumerateCards(cards, ctx).superTractors);
}

/**
 * 垫牌校验结果
 */
export interface FollowValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * 校验垫牌是否合法
 */
export function validateFollowPlay(
  cards: Card[],
  leadCards: Card[],
  hand: Card[],
  ctx: GameContext
): FollowValidationResult {
  // 核心约束：跟牌张数必须与首家一致
  if (cards.length !== leadCards.length) {
    return { valid: false, reason: '跟牌张数必须与首家一致' };
  }

  const leadSuit = getPlaySuit(leadCards, ctx);
  const leadComponents = deriveLeadComponentsForFollow(leadCards, ctx);
  
  // 1. 检查是否有同门牌
  const suitCards = hand.filter(card => {
    const classInfo = classifyCard(card, ctx);
    if (leadSuit === 'trump') {
      return classInfo === 'trump';
    }
    return classInfo !== 'trump' && (classInfo as { suit: string }).suit === leadSuit;
  });
  
  const hasSuit = suitCards.length > 0;
  
  // 2. 如果有同门牌，必须跟同门
  if (hasSuit) {
    const selectedSuitCards = cards.filter(card => {
      const classInfo = classifyCard(card, ctx);
      if (leadSuit === 'trump') {
        return classInfo === 'trump';
      }
      return classInfo !== 'trump' && (classInfo as { suit: string }).suit === leadSuit;
    });

    if (suitCards.length >= leadCards.length) {
      const allSuit = selectedSuitCards.length === cards.length;
      if (!allSuit) {
        return { valid: false, reason: '有同门牌时必须跟同门' };
      }
      return validateStructureMatch(cards, leadComponents, suitCards, ctx);
    }

    // 同门不够：必须先出尽同门，剩余张数可任意垫牌
    const suitIds = new Set(suitCards.map(c => c.id));
    const selectedSuitIds = new Set(selectedSuitCards.map(c => c.id));
    for (const id of suitIds) {
      if (!selectedSuitIds.has(id)) {
        return { valid: false, reason: '同门不够时必须先出尽同门牌' };
      }
    }

    return { valid: true };
  }
  
  return { valid: true };
}

function countPairsFromCards(cards: Card[], ctx: GameContext): number {
  // 使用 parseCards 解析出牌（它会优先识别拖拉机，不会重复计算对子）
  const parsed = parseCards(cards, ctx);
  
  // 统计对子
  let pairs = 0;
  for (const comp of parsed) {
    if (comp.type === 'pair') {
      pairs += 1;
    } else if (comp.type === 'tractor') {
      // 拖拉机中的对子数 = 拖拉机长度
      pairs += comp.length || Math.floor(comp.cards.length / 2);
    } else if (comp.type === 'super_tractor') {
      // 超级拖拉机可以拆成对子
      pairs += comp.length || Math.floor(comp.cards.length / 3);
    } else if (comp.type === 'triple') {
      // 三张可以拆成1对
      pairs += 1;
    }
  }
  
  return pairs;
}

function getLeadRequiredPairSlots(leadComponents: ParseResult): number {
  let slots = 0;
  for (const comp of leadComponents) {
    if (comp.type === 'pair') {
      slots += 1;
    } else if (comp.type === 'tractor') {
      slots += comp.length || Math.floor(comp.cards.length / 2);
    } else if (comp.type === 'triple') {
      // 三张在无法跟三时可拆为 对子+单牌
      slots += 1;
    } else if (comp.type === 'super_tractor') {
      // 超级拖拉机在降阶时至少能贡献对子槽位
      const len = comp.length || Math.floor(comp.cards.length / 3);
      slots += len;
    }
  }
  return slots;
}

function validatePairStructurePriority(
  cards: Card[],
  leadComponents: ParseResult,
  suitCards: Card[],
  ctx: GameContext
): FollowValidationResult | null {
  const totalNeed = leadComponents.reduce((sum, c) => sum + c.cards.length, 0);
  if (suitCards.length < totalNeed) return null;

  const requiredSlots = getLeadRequiredPairSlots(leadComponents);
  if (requiredSlots <= 0) return null;

  const maxPairsInSuit = countPairsFromCards(suitCards, ctx);
  const requiredPairs = Math.min(requiredSlots, maxPairsInSuit);
  if (requiredPairs <= 0) return null;

  const selectedPairs = countPairsFromCards(cards, ctx);
  if (selectedPairs < requiredPairs) {
    return { valid: false, reason: '跟牌时需优先出尽可能多的对子结构' };
  }

  return { valid: true };
}

function validateTripleStructurePriority(
  cards: Card[],
  leadComponents: ParseResult,
  suitCards: Card[],
  ctx: GameContext
): FollowValidationResult | null {
  const totalNeed = leadComponents.reduce((sum, c) => sum + c.cards.length, 0);
  if (suitCards.length < totalNeed) return null;

  const requiredSlots = getLeadRequiredTripleSlots(leadComponents);
  if (requiredSlots <= 0) return null;

  const maxTriplesInSuit = countTriplesFromCards(suitCards);
  const requiredTriples = Math.min(requiredSlots, maxTriplesInSuit);
  if (requiredTriples <= 0) return null;

  const selectedTriples = countTriplesFromCards(cards);
  if (selectedTriples < requiredTriples) {
    return { valid: false, reason: '跟牌时需优先出尽可能多的三张结构' };
  }

  return { valid: true };
}

function buildPairPriorityFollow(
  leadComponents: ParseResult,
  suitCards: Card[],
  totalNeeded: number,
  ctx: GameContext
): Card[] | null {
  if (suitCards.length < totalNeeded) return null;

  const requiredSlots = getLeadRequiredPairSlots(leadComponents);
  const maxPairsInSuit = countPairsFromCards(suitCards, ctx);
  const requiredPairs = Math.min(requiredSlots, maxPairsInSuit);
  if (requiredPairs <= 0) return null;

  const counts = countCards(suitCards);
  const pairBuckets: Card[][] = [];
  for (const [, list] of counts) {
    if (list.length >= 2) pairBuckets.push(list);
  }

  pairBuckets.sort((a, b) => cardCompare(a[0], b[0], ctx));

  const picked: Card[] = [];
  const used = new Set<number>();

  let needPairs = requiredPairs;
  for (const bucket of pairBuckets) {
    if (needPairs <= 0) break;
    const two = bucket.slice(0, 2);
    picked.push(...two);
    used.add(two[0].id);
    used.add(two[1].id);
    needPairs -= 1;
  }

  if (needPairs > 0) return null;

  const remain = suitCards
    .filter(c => !used.has(c.id))
    .sort((a, b) => cardCompare(a, b, ctx));

  const needRest = totalNeeded - picked.length;
  if (needRest < 0 || remain.length < needRest) return null;

  return [...picked, ...remain.slice(0, needRest)];
}

function buildSuperTractorPriorityFollow(
  leadComponents: ParseResult,
  suitCards: Card[],
  totalNeeded: number,
  ctx: GameContext
): Card[] | null {
  if (suitCards.length < totalNeeded) return null;

  const leadLen = leadComponents
    .filter(c => c.type === 'super_tractor')
    .reduce((max, c) => Math.max(max, c.length || Math.floor(c.cards.length / 3)), 0);
  if (leadLen <= 0) return null;

  const enumerated = enumerateCards(suitCards, ctx);
  if (enumerated.superTractors.length === 0) return null;

  const requiredTriples = Math.min(leadLen, countTriplesFromCards(suitCards));
  const tripleBuckets = Array.from(countCards(suitCards).values())
    .filter(list => list.length >= 3)
    .map(list => list.slice(0, 3))
    .sort((a, b) => cardCompare(a[0], b[0], ctx));

  const candidates: Card[][] = [];

  for (const chain of enumerated.superTractors) {
    const picked: Card[] = chain.slice(0, Math.min(chain.length, leadLen)).flatMap(c => c.cards);
    const used = new Set(picked.map(c => c.id));

    for (const triple of tripleBuckets) {
      if (picked.length + 3 > totalNeeded) break;
      if (triple.some(c => used.has(c.id))) continue;
      if (countTriplesFromCards(picked) >= requiredTriples) break;
      picked.push(...triple);
      for (const card of triple) used.add(card.id);
    }

    const remaining = suitCards
      .filter(c => !used.has(c.id))
      .sort((a, b) => cardCompare(a, b, ctx));

    const needRest = totalNeeded - picked.length;
    if (needRest < 0 || remaining.length < needRest) continue;

    const candidate = [...picked, ...remaining.slice(0, needRest)];
    if (candidate.length === totalNeeded) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const chainDiff = maxSuperTractorChainLengthInCards(b, ctx) - maxSuperTractorChainLengthInCards(a, ctx);
    if (chainDiff !== 0) return chainDiff;
    const tripleDiff = countTriplesFromCards(b) - countTriplesFromCards(a);
    if (tripleDiff !== 0) return tripleDiff;
    const aSorted = [...a].sort((x, y) => cardCompare(x, y, ctx));
    const bSorted = [...b].sort((x, y) => cardCompare(x, y, ctx));
    for (let i = 0; i < Math.min(aSorted.length, bSorted.length); i++) {
      const cmp = cardCompare(aSorted[i], bSorted[i], ctx);
      if (cmp !== 0) return cmp;
    }
    return aSorted.length - bSorted.length;
  });

  return candidates[0];
}

function buildStructuredFollow(
  leadComponents: ParseResult,
  suitCards: Card[],
  totalNeeded: number,
  ctx: GameContext
): Card[] | null {
  const structured = pickBestStructuredFollow(leadComponents, suitCards, ctx);
  if (structured && structured.length === totalNeeded) return structured;

  const superPriority = buildSuperTractorPriorityFollow(leadComponents, suitCards, totalNeeded, ctx);
  if (superPriority && superPriority.length === totalNeeded) return superPriority;

  const tractorPriority = buildTractorPriorityFollow(leadComponents, suitCards, totalNeeded, ctx);
  if (tractorPriority && tractorPriority.length === totalNeeded) return tractorPriority;

  const pairPriority = buildPairPriorityFollow(leadComponents, suitCards, totalNeeded, ctx);
  if (pairPriority && pairPriority.length === totalNeeded) return pairPriority;

  return null;
}

function buildTractorPriorityFollow(
  leadComponents: ParseResult,
  suitCards: Card[],
  totalNeeded: number,
  ctx: GameContext
): Card[] | null {
  if (suitCards.length < totalNeeded) return null;

  const leadLen = leadComponents
    .filter(c => c.type === 'tractor')
    .reduce((max, c) => Math.max(max, c.length || Math.floor(c.cards.length / 2)), 0);
  if (leadLen <= 0) return null;

  const enumerated = enumerateCards(suitCards, ctx);
  if (enumerated.tractors.length === 0) return null;

  const requiredPairs = Math.min(leadLen, countPairsFromCards(suitCards, ctx));
  const pairBuckets = Array.from(countCards(suitCards).values())
    .filter(list => list.length >= 2)
    .map(list => list.slice(0, 2))
    .sort((a, b) => cardCompare(a[0], b[0], ctx));

  const candidates: Card[][] = [];

  for (const chain of enumerated.tractors) {
    const picked: Card[] = chain.slice(0, Math.min(chain.length, leadLen)).flatMap(c => c.cards);
    const used = new Set(picked.map(c => c.id));

    for (const pair of pairBuckets) {
      if (picked.length + 2 > totalNeeded) break;
      if (pair.some(c => used.has(c.id))) continue;
      if (countPairsFromCards(picked, ctx) >= requiredPairs) break;
      picked.push(...pair);
      used.add(pair[0].id);
      used.add(pair[1].id);
    }

    const remaining = suitCards
      .filter(c => !used.has(c.id))
      .sort((a, b) => cardCompare(a, b, ctx));

    const needRest = totalNeeded - picked.length;
    if (needRest < 0 || remaining.length < needRest) continue;

    const candidate = [...picked, ...remaining.slice(0, needRest)];
    if (candidate.length === totalNeeded) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const chainDiff = maxTractorChainLengthInCards(b, ctx) - maxTractorChainLengthInCards(a, ctx);
    if (chainDiff !== 0) return chainDiff;
    const pairDiff = countPairsFromCards(b, ctx) - countPairsFromCards(a, ctx);
    if (pairDiff !== 0) return pairDiff;
    const aSorted = [...a].sort((x, y) => cardCompare(x, y, ctx));
    const bSorted = [...b].sort((x, y) => cardCompare(x, y, ctx));
    for (let i = 0; i < Math.min(aSorted.length, bSorted.length); i++) {
      const cmp = cardCompare(aSorted[i], bSorted[i], ctx);
      if (cmp !== 0) return cmp;
    }
    return aSorted.length - bSorted.length;
  });

  return candidates[0];
}

function hasRequiredPairCapacity(suitCards: Card[], leadComponents: ParseResult, ctx: GameContext): boolean {
  const requiredSlots = getLeadRequiredPairSlots(leadComponents);
  if (requiredSlots <= 0) return true;
  const maxPairsInSuit = countPairsFromCards(suitCards, ctx);
  return maxPairsInSuit >= Math.min(requiredSlots, Math.floor(suitCards.length / 2));
}

/**
 * 校验垫牌结构是否匹配
 */
function validateStructureMatch(
  cards: Card[],
  leadComponents: ParseResult,
  suitCards: Card[],
  ctx: GameContext
): FollowValidationResult {
  const strictChain = validateChainStructurePriority(cards, leadComponents, suitCards, ctx);
  if (strictChain) return strictChain;

  const triplePriority = validateTripleStructurePriority(cards, leadComponents, suitCards, ctx);
  if (triplePriority) return triplePriority;

  const pairPriority = validatePairStructurePriority(cards, leadComponents, suitCards, ctx);
  if (pairPriority) return pairPriority;

  const followComponents = deriveLeadComponentsForFollow(cards, ctx);
  
  // 统计领牌各类型数量
  const leadCounts = countComponentTypes(leadComponents);
  const followCounts = countComponentTypes(followComponents);
  
  // 检查是否能完全匹配
  if (canMatchExactly(leadCounts, followCounts)) {
    return { valid: true };
  }
  
  // 不能完全匹配，检查是否能通过拆分高阶结构匹配
  if (canMatchBySplitting(leadCounts, followCounts, followComponents)) {
    return { valid: true };
  }
  
  // 检查手牌是否足够匹配
  if (!hasEnoughCards(suitCards, leadComponents)) {
    // 牌不够，可以垫任意组合
    return { valid: true };
  }

  // 张数够但结构能力不够（例如首家对子而我方同门全是单牌），也应允许
  if (!hasRequiredPairCapacity(suitCards, leadComponents, ctx)) {
    return { valid: true };
  }
  
  return { valid: false, reason: '垫牌结构不匹配' };
}

function validateChainStructurePriority(
  cards: Card[],
  leadComponents: ParseResult,
  suitCards: Card[],
  ctx: GameContext
): FollowValidationResult | null {
  const suitEnum = enumerateCards(suitCards, ctx);
  const followEnum = enumerateCards(cards, ctx);

  const leadTractorLen = leadComponents
    .filter(c => c.type === 'tractor')
    .reduce((max, c) => Math.max(max, c.length || Math.floor(c.cards.length / 2)), 0);

  if (leadTractorLen > 0) {
    const maxSuitChainLen = maxChainLength(suitEnum.tractors);
    const requiredChainLen = Math.min(leadTractorLen, maxSuitChainLen);
    if (requiredChainLen > 0) {
      const actualChainLen = maxChainLength(followEnum.tractors);
      if (actualChainLen < requiredChainLen) {
        return { valid: false, reason: '有足够拖拉机长度时必须跟足拖拉机' };
      }
    }
  }

  const leadSuperLen = leadComponents
    .filter(c => c.type === 'super_tractor')
    .reduce((max, c) => Math.max(max, c.length || Math.floor(c.cards.length / 3)), 0);

  if (leadSuperLen > 0) {
    const maxSuitChainLen = maxChainLength(suitEnum.superTractors);
    const requiredChainLen = Math.min(leadSuperLen, maxSuitChainLen);
    if (requiredChainLen > 0) {
      const actualChainLen = maxChainLength(followEnum.superTractors);
      if (actualChainLen < requiredChainLen) {
        return { valid: false, reason: '有足够超级拖拉机长度时必须跟足超级拖拉机' };
      }
    }
  }

  if (leadComponents.length !== 1) return null;

  const lead = leadComponents[0];

  if (lead.type === 'tractor') {
    const leadLen = lead.length || Math.floor(lead.cards.length / 2);
    const maxSuitChainLen = maxChainLength(suitEnum.tractors);
    const requiredChainLen = Math.min(leadLen, maxSuitChainLen);
    if (requiredChainLen <= 0) return null;

    const actualChainLen = maxChainLength(followEnum.tractors);
    if (actualChainLen < requiredChainLen) {
      return { valid: false, reason: '有足够拖拉机长度时必须跟足拖拉机' };
    }
    
    const requiredPairs = Math.min(leadLen, countPairsFromCards(suitCards, ctx));
    const actualPairs = countPairsFromCards(cards, ctx);
    if (actualPairs < requiredPairs) {
      return { valid: false, reason: '跟拖拉机时需优先出尽可能多的对子结构' };
    }
    
    return { valid: true };
  }

  if (lead.type === 'super_tractor') {
    const leadLen = lead.length || Math.floor(lead.cards.length / 3);
    const maxSuitChainLen = maxChainLength(suitEnum.superTractors);
    const requiredChainLen = Math.min(leadLen, maxSuitChainLen);
    if (requiredChainLen <= 0) return null;

    const actualChainLen = maxChainLength(followEnum.superTractors);
    if (actualChainLen < requiredChainLen) {
      return { valid: false, reason: '有足够超级拖拉机长度时必须跟足超级拖拉机' };
    }

    const requiredTriples = Math.min(leadLen, countTriplesFromCards(suitCards));
    const actualTriples = countTriplesFromCards(cards);
    if (actualTriples < requiredTriples) {
      return { valid: false, reason: '跟超级拖拉机时需优先出尽可能多的三张结构' };
    }

    return { valid: true };
  }

  return null;
}

/**
 * 统计组件类型数量
 */
function countComponentTypes(components: ParseResult): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const comp of components) {
    const current = counts.get(comp.type) || 0;
    counts.set(comp.type, current + 1);
  }
  
  return counts;
}

/**
 * 检查是否能完全匹配
 */
function canMatchExactly(leadCounts: Map<string, number>, followCounts: Map<string, number>): boolean {
  for (const [type, count] of leadCounts) {
    const followCount = followCounts.get(type) || 0;
    if (followCount < count) {
      return false;
    }
  }
  return true;
}

/**
 * 检查是否能通过拆分高阶结构匹配
 * 规则：三张可拆成对子+单牌，拖拉机可拆成对子，对子可拆成单牌
 */
function canMatchBySplitting(
  leadCounts: Map<string, number>,
  followCounts: Map<string, number>,
  followComponents: ParseResult
): boolean {
  // 需求
  const neededSingles = leadCounts.get('single') || 0;
  const neededPairs = leadCounts.get('pair') || 0;
  const neededTractors = leadCounts.get('tractor') || 0;
  const neededTriples = leadCounts.get('triple') || 0;
  const neededSuperTractors = leadCounts.get('super_tractor') || 0;
  
  // 可用的组件
  let availableSingles = followCounts.get('single') || 0;
  let availablePairs = followCounts.get('pair') || 0;
  let availableTractors = followCounts.get('tractor') || 0;
  let availableTriples = followCounts.get('triple') || 0;
  let availableSuperTractors = followCounts.get('super_tractor') || 0;
  
  // 检查超级拖拉机
  if (availableSuperTractors < neededSuperTractors) {
    return false;
  }
  // 如果有多余的超级拖拉机，可以拆成三张
  availableTriples += (availableSuperTractors - neededSuperTractors);
  
  // 检查三张
  if (availableTriples < neededTriples) {
    // 如果三张不够，可以用对子+单牌组合
    const deficit = neededTriples - availableTriples;
    // 每个三张可以用一个对子+一个单牌代替
    if (availablePairs >= deficit && availableSingles >= deficit) {
      availablePairs -= deficit;
      availableSingles -= deficit;
    } else {
      return false;
    }
  } else {
    // 如果有多余的三张，可以拆成对子+单牌
    const extraTriples = availableTriples - neededTriples;
    if (extraTriples > 0) {
      availablePairs += extraTriples;
      availableSingles += extraTriples;
    }
  }
  
  // 检查拖拉机
  if (availableTractors < neededTractors) {
    return false; // 拖拉机无法从其他结构得到
  }
  // 如果有多余的拖拉机，可以拆成对子
  const extraTractors = availableTractors - neededTractors;
  availablePairs += extraTractors * 2; // 每个拖拉机有2个对子
  
  // 检查对子
  if (availablePairs < neededPairs) {
    return false;
  }
  // 如果有多余的对子，可以拆成单牌
  const extraPairs = availablePairs - neededPairs;
  availableSingles += extraPairs * 2;
  
  // 检查单牌
  if (availableSingles < neededSingles) {
    return false;
  }
  
  return true;
}

/**
 * 检查手牌是否有足够的牌来匹配
 */
function hasEnoughCards(suitCards: Card[], leadComponents: ParseResult): boolean {
  const totalLeadCards = leadComponents.reduce((sum, comp) => sum + comp.cards.length, 0);
  return suitCards.length >= totalLeadCards;
}

/**
 * 自动补选垫牌
 * 当玩家牌不够时，自动补选最合适的牌
 */
export function autoCompleteFollow(
  selectedCards: Card[],
  leadCards: Card[],
  hand: Card[],
  ctx: GameContext
): Card[] {
  // 防护检查
  if (!hand || hand.length === 0) {
    return selectedCards || [];
  }
  
  const leadSuit = getPlaySuit(leadCards, ctx);
  const leadComponents = deriveLeadComponentsForFollow(leadCards, ctx);
  const totalNeeded = leadCards.length;
  
  // 获取同门牌
  const suitCards = hand.filter(card => {
    const classInfo = classifyCard(card, ctx);
    if (leadSuit === 'trump') {
      return classInfo === 'trump';
    }
    return classInfo !== 'trump' && (classInfo as { suit: string }).suit === leadSuit;
  });
  
  // 如果选的牌已经够了
  if (selectedCards.length >= totalNeeded) {
    const trimmed = selectedCards.slice(0, totalNeeded);
    const validation = validateFollowPlay(trimmed, leadCards, hand, ctx);
    if (validation.valid) return trimmed;

    if (suitCards.length >= totalNeeded) {
      const structured = buildStructuredFollow(leadComponents, suitCards, totalNeeded, ctx);
      if (structured) return structured;
    }

    return trimmed;
  }
  
  // 需要补选
  const needed = totalNeeded - selectedCards.length;
  const selectedSet = new Set(selectedCards.map(c => c.id));
  
  // 优先从同门牌中补选
  const availableSuit = suitCards.filter(c => !selectedSet.has(c.id));

  // 用枚举解析优先补齐结构（尤其拖拉机）
  if (availableSuit.length >= needed && selectedCards.length === 0) {
    const structured = buildStructuredFollow(leadComponents, availableSuit, totalNeeded, ctx);
    if (structured) return structured;
  }
  
  if (availableSuit.length >= needed) {
    // 补选最小的同门牌
    const sorted = [...availableSuit].sort((a, b) => cardCompare(a, b, ctx));
    const candidate = [...selectedCards, ...sorted.slice(0, needed)];
    const validation = validateFollowPlay(candidate, leadCards, hand, ctx);
    if (validation.valid) return candidate;

    if (suitCards.length >= totalNeeded) {
      const structured = buildStructuredFollow(leadComponents, suitCards, totalNeeded, ctx);
      if (structured) return structured;
    }

    return candidate;
  }
  
  // 同门牌不够，从其他门补选
  const otherCards = hand.filter(c => !selectedSet.has(c.id) && !availableSuit.some(s => s.id === c.id));
  
  // 简单排序：同门牌在前，其他牌在后，不需要精确比较大小
  const sorted = [...availableSuit, ...otherCards];
  
  return [...selectedCards, ...sorted.slice(0, needed)];
}

/**
 * 获取垫牌的最小牌（用于判断谁大）
 */
export function getFollowMinCard(cards: Card[], ctx: GameContext): Card {
  const components = parseCards(cards, ctx);
  
  // 找最小的组件，返回其中的最小牌
  let minCard = cards[0];
  
  for (const comp of components) {
    for (const card of comp.cards) {
      if (cardCompare(card, minCard, ctx) < 0) {
        minCard = card;
      }
    }
  }
  
  return minCard;
}