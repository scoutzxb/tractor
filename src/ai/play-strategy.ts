import type { Card, GameContext, Component, ParseResult, Seat } from '../core/types';
import { parseCards, getPlaySuit } from '../core/parser';
import { enumerateCards } from '../core/parser-enumerate';
import { classifyCard, getCardKey } from '../core/deck';
import { validateFollowPlay, autoCompleteFollow } from '../core/follow-validator';
import { getWinningPlay as getWinningPlayCore } from '../core/trick-judge';

type CoverMode = 'aggressive' | 'conservative';

let COVER_MODE: CoverMode = 'aggressive';
let THROW_LEAD_RATE = 0.5;
let THROW_RANDOM_SOURCE: () => number = Math.random;
let THROW_SINGLE_LEVELS = 1;

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14
};

export function setCoverMode(mode: CoverMode): void { COVER_MODE = mode; }
export function getCoverMode(): CoverMode { return COVER_MODE; }
export function setThrowLeadRate(rate: number): void {
  if (!Number.isFinite(rate)) return;
  THROW_LEAD_RATE = Math.max(0, Math.min(1, rate));
}
export function getThrowLeadRate(): number { return THROW_LEAD_RATE; }
export function setThrowRandomSource(fn: () => number): void {
  if (typeof fn === 'function') THROW_RANDOM_SOURCE = fn;
}
export function setThrowSingleLevels(levels: number): void {
  if (!Number.isFinite(levels)) return;
  THROW_SINGLE_LEVELS = Math.max(0, Math.floor(levels));
}
export function getThrowSingleLevels(): number { return THROW_SINGLE_LEVELS; }

function getCardPointValue(card: Card): number {
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

function getCardsPointValue(cards: Card[]): number {
  return cards.reduce((s, c) => s + getCardPointValue(c), 0);
}

function getCardValueForStrategy(card: Card, ctx: GameContext): number {
  if (card.joker === 'big') return 1000;
  if (card.joker === 'small') return 999;
  if (card.rank === ctx.level) {
    if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) return 998;
    return 997;
  }
  return RANK_VALUES[card.rank!] || 0;
}

function compareCardsForStrategy(a: Card, b: Card, ctx: GameContext): number {
  const ca = classifyCard(a, ctx);
  const cb = classifyCard(b, ctx);
  if (ca === 'trump' && cb !== 'trump') return 1;
  if (ca !== 'trump' && cb === 'trump') return -1;
  return getCardValueForStrategy(a, ctx) - getCardValueForStrategy(b, ctx);
}

function compareComponents(a: Component, b: Component, ctx: GameContext): number {
  return compareCardsForStrategy(a.cards[0], b.cards[0], ctx);
}

function componentPriority(c: Component): number {
  if (c.type === 'super_tractor') return 5;
  if (c.type === 'triple') return 4;
  if (c.type === 'tractor') return 3;
  if (c.type === 'pair') return 2;
  return 1;
}

function componentChainLength(c: Component): number {
  if (c.type === 'tractor' || c.type === 'super_tractor') {
    return c.length || Math.floor(c.cards.length / (c.type === 'tractor' ? 2 : 3));
  }
  return 1;
}

function compareByLeadPriority(a: Component, b: Component, ctx: GameContext): number {
  const pa = componentPriority(a);
  const pb = componentPriority(b);
  if (pa !== pb) return pb - pa;

  const la = componentChainLength(a);
  const lb = componentChainLength(b);
  if (la !== lb) return lb - la;

  return compareComponents(b, a, ctx);
}

function getAllowedThrowSingleRanks(ctx: GameContext, levels: number): string[] {
  if (levels <= 0) return [];
  const base = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  const start = ctx.level === 'A' ? 1 : 0;
  return base.slice(start, start + levels);
}

function buildThrowLeadCandidate(hand: Card[], ctx: GameContext): Card[] | null {
  const suitBuckets = new Map<string, Card[]>();
  for (const c of hand) {
    const cls = classifyCard(c, ctx);
    if (cls === 'trump') continue;
    const suit = (cls as { suit: string }).suit;
    if (!suitBuckets.has(suit)) suitBuckets.set(suit, []);
    suitBuckets.get(suit)!.push(c);
  }
  if (suitBuckets.size === 0) return null;

  let anchorSuit: string | null = null;
  let anchorComp: Component | null = null;

  for (const [suit, cards] of suitBuckets) {
    const comps = parseCards(cards, ctx).filter(c => c.type !== 'single');
    for (const c of comps) {
      if (!anchorComp) {
        anchorComp = c;
        anchorSuit = suit;
      } else {
        if (compareByLeadPriority(c, anchorComp, ctx) < 0) {
          anchorComp = c;
          anchorSuit = suit;
        }
      }
    }
  }

  if (!anchorComp || !anchorSuit) return null;

  const suitCards = suitBuckets.get(anchorSuit)!;
  const comps = parseCards(suitCards, ctx);
  const nonSingles = comps.filter(c => c.type !== 'single').sort((a, b) => compareByLeadPriority(a, b, ctx));
  const singles = comps.filter(c => c.type === 'single').sort((a, b) => compareComponents(b, a, ctx));
  const allowedRanks = getAllowedThrowSingleRanks(ctx, THROW_SINGLE_LEVELS);
  const bestSingle = singles.find(s => allowedRanks.includes(s.cards[0]?.rank || '')) || null;

  const targetKinds = THROW_RANDOM_SOURCE() < 0.5 ? 2 : 3;
  const picked: Component[] = [anchorComp];
  const used = new Set(anchorComp.cards.map(c => c.id));

  for (const c of nonSingles) {
    if (picked.length >= targetKinds) break;
    if (c.cards.some(x => used.has(x.id))) continue;
    picked.push(c);
    for (const x of c.cards) used.add(x.id);
  }

  if (picked.length < targetKinds && bestSingle) {
    const sc = bestSingle.cards[0];
    if (!used.has(sc.id)) picked.push(bestSingle);
  }

  if (picked.length < 2) return null;
  return picked.flatMap(c => c.cards);
}

export function leadCardsStrategy(hand: Card[], ctx: GameContext): Card[] {
  if (THROW_RANDOM_SOURCE() < THROW_LEAD_RATE) {
    const throwLead = buildThrowLeadCandidate(hand, ctx);
    if (throwLead && throwLead.length > 1) return throwLead;
  }

  const comps = parseCards(hand, ctx);
  const nonTrump = comps.filter(c => classifyCard(c.cards[0], ctx) !== 'trump');
  const trump = comps.filter(c => classifyCard(c.cards[0], ctx) === 'trump');

  const nonTrumpHigh = nonTrump.filter(c => c.type !== 'single');
  if (nonTrumpHigh.length > 0) {
    nonTrumpHigh.sort((a, b) => compareByLeadPriority(a, b, ctx));
    return nonTrumpHigh[0].cards;
  }

  const trumpHigh = trump.filter(c => c.type !== 'single');
  if (trumpHigh.length > 0) {
    trumpHigh.sort((a, b) => compareByLeadPriority(a, b, ctx));
    return trumpHigh[0].cards;
  }

  const nonTrumpSingles = nonTrump.filter(c => c.type === 'single').sort((a, b) => compareComponents(b, a, ctx));
  if (nonTrumpSingles.length > 0) return nonTrumpSingles[0].cards;

  const trumpSingles = trump.filter(c => c.type === 'single').sort((a, b) => compareComponents(a, b, ctx));
  if (trumpSingles.length > 0) return trumpSingles[0].cards;

  return hand.length > 0 ? [hand[0]] : [];
}

export function getPartner(seat: Seat): Seat {
  const p: Record<Seat, Seat> = { east: 'west', west: 'east', north: 'south', south: 'north' };
  return p[seat];
}

function isPartner(a: Seat, b: Seat): boolean {
  return getPartner(a) === b;
}

function deriveLeadComponentsForFollowStrategy(leadCards: Card[], ctx: GameContext): ParseResult {
  const enumerated = enumerateCards(leadCards, ctx);
  const total = leadCards.length;

  const fullSuper = enumerated.superTractors.filter(ch => ch.length * 3 === total).sort((a, b) => b.length - a.length);
  if (fullSuper.length > 0) return [{ type: 'super_tractor', cards: fullSuper[0].flatMap(c => c.cards), length: fullSuper[0].length }];

  const fullTr = enumerated.tractors.filter(ch => ch.length * 2 === total).sort((a, b) => b.length - a.length);
  if (fullTr.length > 0) return [{ type: 'tractor', cards: fullTr[0].flatMap(c => c.cards), length: fullTr[0].length }];

  return parseCards(leadCards, ctx);
}

function getComboBreakPenalty(selectedCards: Card[], suitCards: Card[], ctx: GameContext): number {
  const totalByKey = new Map<string, number>();
  for (const c of suitCards) totalByKey.set(getCardKey(c), (totalByKey.get(getCardKey(c)) || 0) + 1);

  const usedByKey = new Map<string, number>();
  for (const c of selectedCards) usedByKey.set(getCardKey(c), (usedByKey.get(getCardKey(c)) || 0) + 1);

  let p = 0;
  for (const [k, used] of usedByKey) {
    const total = totalByKey.get(k) || 0;
    if (total >= 3 && used < total) p += (total - used);
    if (total === 2 && used === 1) p += 1;
  }

  const tractorPairKeys = new Set<string>();
  const enumSuit = enumerateCards(suitCards, ctx);
  for (const chain of enumSuit.tractors) {
    for (const pairComp of chain) {
      tractorPairKeys.add(getCardKey(pairComp.cards[0]));
    }
  }

  for (const [k, used] of usedByKey) {
    if (!tractorPairKeys.has(k)) continue;
    if (used >= 2) p += 2;
    else if (used === 1) p += 1;
  }

  return p;
}

function chooseFillersForPartnerLead(hand: Card[], otherCards: Card[], needFill: number, ctx: GameContext): Card[] {
  const keyCount = new Map<string, number>();
  for (const c of hand) keyCount.set(getCardKey(c), (keyCount.get(getCardKey(c)) || 0) + 1);

  return [...otherCards].sort((a, b) => {
    const aTrump = classifyCard(a, ctx) === 'trump';
    const bTrump = classifyCard(b, ctx) === 'trump';
    if (aTrump !== bTrump) return aTrump ? 1 : -1;

    const ap = getCardPointValue(a);
    const bp = getCardPointValue(b);
    if (ap !== bp) return bp - ap;

    const am = keyCount.get(getCardKey(a)) || 1;
    const bm = keyCount.get(getCardKey(b)) || 1;
    const aBreak = am > 1 ? 1 : 0;
    const bBreak = bm > 1 ? 1 : 0;
    if (aBreak !== bBreak) return aBreak - bBreak;

    return compareCardsForStrategy(a, b, ctx);
  }).slice(0, needFill);
}

function buildCandidatesFromSuit(suitCards: Card[], leadCards: Card[], ctx: GameContext): Card[][] {
  const need = leadCards.length;
  const comps = deriveLeadComponentsForFollowStrategy(leadCards, ctx);

  // single
  if (need === 1) return suitCards.map(c => [c]);

  // 统一按照comps结构处理
  // 分析comps结构：需要多少对、多少单牌
  let needPairs = 0;
  let needTriples = 0;
  let needSingles = 0;
  let needTractorLen = 0;
  
  for (const c of comps) {
    if (c.type === 'pair') needPairs++;
    else if (c.type === 'triple') needTriples++;
    else if (c.type === 'tractor') needTractorLen += c.length || Math.floor(c.cards.length / 2);
    else if (c.type === 'single') needSingles++;
    else if (c.type === 'super_tractor') {
      // 三张拖拉机，按三张处理
      needTriples += c.length || Math.floor(c.cards.length / 3);
    }
  }

  const parsed = parseCards(suitCards, ctx);
  const pairs = parsed.filter(c => c.type === 'pair');
  const triples = parsed.filter(c => c.type === 'triple');
  const tractors = parsed.filter(c => c.type === 'tractor');

  // 如果需要拖拉机
  if (needTractorLen > 0) {
    const out: Card[][] = [];
    for (const t of tractors) {
      if ((t.length || 2) >= needTractorLen) {
        out.push([...t.cards].slice(0, needTractorLen * 2));
      }
    }
    // 拖拉机不足时，用对子凑
    if (out.length === 0 && pairs.length >= needTractorLen) {
      const selected: Card[] = [];
      for (let i = 0; i < needTractorLen && i < pairs.length; i++) {
        selected.push(...pairs[i].cards);
      }
      if (selected.length === needTractorLen * 2) out.push(selected);
    }
    // 对子也不足时，允许降阶
    if (out.length === 0) {
      const pairCount = Math.min(pairs.length, needTractorLen);
      const selected: Card[] = [];
      for (let i = 0; i < pairCount; i++) {
        selected.push(...pairs[i].cards);
      }
      const singlesNeed = need - selected.length;
      const remainingCards = suitCards.filter(c => !selected.includes(c));
      for (let i = 0; i < remainingCards.length && selected.length < need; i++) {
        selected.push(remainingCards[i]);
      }
      if (selected.length === need) out.push(selected);
    }
    return out;
  }

  // 如果需要三张
  if (needTriples > 0) {
    const out: Card[][] = [];
    for (const t of triples) out.push([...t.cards]);
    // 三张不足时，用对子+单牌凑
    if (out.length === 0 && pairs.length > 0) {
      for (const p of pairs) {
        for (const c of suitCards) {
          if (!p.cards.includes(c)) out.push([...p.cards, c]);
        }
      }
    }
    return out;
  }

  // 如果需要对子
  if (needPairs > 0) {
    const byKey = new Map<string, Card[]>();
    for (const c of suitCards) {
      const k = getCardKey(c);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(c);
    }

    const allPairs: Card[][] = [];
    for (const arr of byKey.values()) {
      if (arr.length >= 2) allPairs.push([arr[0], arr[1]]);
    }
    if (allPairs.length > 0) {
      allPairs.sort((a, b) => compareCardsForStrategy(a[0], b[0], ctx));
      return allPairs;
    }
    if (pairs.length > 0) return pairs.map(p => [...p.cards]);
    return [];
  }

  // 如果全是单牌（needSingles === need）
  if (needSingles === need) {
    // 返回所有need张牌的组合
    if (suitCards.length < need) return [];
    const out: Card[][] = [];
    
    // 简单实现：返回所有组合（对于小need值可行）
    function combine(arr: Card[], k: number, start: number, current: Card[]): void {
      if (current.length === k) {
        out.push([...current]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        combine(arr, k, i + 1, current);
        current.pop();
      }
    }
    combine(suitCards, need, 0, []);
    return out;
  }

  // 混合结构：对子 + 单牌
  if (needPairs > 0 && needSingles > 0) {
    const out: Card[][] = [];
    const byKey = new Map<string, Card[]>();
    for (const c of suitCards) {
      const k = getCardKey(c);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(c);
    }

    const allPairs: Card[][] = [];
    for (const arr of byKey.values()) {
      if (arr.length >= 2) allPairs.push([arr[0], arr[1]]);
    }

    for (const pair of allPairs) {
      const remainingCards = suitCards.filter(c => !pair.includes(c));
      // 从剩余牌中选needSingles张
      function combineSingles(arr: Card[], k: number, start: number, current: Card[]): void {
        if (current.length === k) {
          out.push([...pair, ...current]);
          return;
        }
        for (let i = start; i < arr.length; i++) {
          current.push(arr[i]);
          combineSingles(arr, k, i + 1, current);
          current.pop();
        }
      }
      combineSingles(remainingCards, needSingles, 0, []);
    }
    return out;
  }

  return [];
}

function countPairsByKey(cards: Card[]): number {
  const cnt = new Map<string, number>();
  for (const c of cards) cnt.set(getCardKey(c), (cnt.get(getCardKey(c)) || 0) + 1);
  let p = 0;
  for (const [, n] of cnt) p += Math.floor(n / 2);
  return p;
}

function getLeadRequiredPairSlotsForStrategy(leadComponents: ParseResult): number {
  let slots = 0;
  for (const comp of leadComponents) {
    if (comp.type === 'pair') slots += 1;
    else if (comp.type === 'tractor') slots += comp.length || Math.floor(comp.cards.length / 2);
    else if (comp.type === 'triple') slots += 1;
    else if (comp.type === 'super_tractor') slots += comp.length || Math.floor(comp.cards.length / 3);
  }
  return slots;
}

function buildPartnerDonationFollow(leadCards: Card[], suitCards: Card[], ctx: GameContext): Card[] | null {
  const need = leadCards.length;
  if (suitCards.length < need) return null;

  const leadComponents = deriveLeadComponentsForFollowStrategy(leadCards, ctx);
  const requiredSlots = getLeadRequiredPairSlotsForStrategy(leadComponents);
  const maxPairs = countPairsByKey(suitCards);
  const requiredPairs = Math.min(requiredSlots, maxPairs);

  const byKey = new Map<string, Card[]>();
  for (const c of suitCards) {
    const k = getCardKey(c);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(c);
  }

  const pairBuckets = [...byKey.values()].filter(arr => arr.length >= 2);
  pairBuckets.sort((a, b) => {
    const ap = getCardPointValue(a[0]) * 2;
    const bp = getCardPointValue(b[0]) * 2;
    if (ap !== bp) return bp - ap;
    return compareCardsForStrategy(a[0], b[0], ctx);
  });

  const picked: Card[] = [];
  const used = new Set<number>();

  let needPairs = requiredPairs;
  for (const arr of pairBuckets) {
    if (needPairs <= 0) break;
    const two = arr.slice(0, 2);
    picked.push(...two);
    used.add(two[0].id);
    used.add(two[1].id);
    needPairs -= 1;
  }

  if (needPairs > 0) return null;

  const restNeed = need - picked.length;
  if (restNeed < 0) return null;

  const rest = suitCards
    .filter(c => !used.has(c.id))
    .sort((a, b) => {
      const ap = getCardPointValue(a);
      const bp = getCardPointValue(b);
      if (ap !== bp) return bp - ap;
      return compareCardsForStrategy(a, b, ctx);
    })
    .slice(0, restNeed);

  if (rest.length !== restNeed) return null;
  return [...picked, ...rest];
}

function buildSafeVoidDump(hand: Card[], need: number, ctx: GameContext): Card[] {
  const keyCount = new Map<string, number>();
  for (const c of hand) keyCount.set(getCardKey(c), (keyCount.get(getCardKey(c)) || 0) + 1);

  // 计算剩余牌数，用于判断对子是否可以保留
  const remaining = hand.length - need;

  return [...hand]
    .sort((a, b) => {
      const aTrump = classifyCard(a, ctx) === 'trump';
      const bTrump = classifyCard(b, ctx) === 'trump';
      if (aTrump !== bTrump) return aTrump ? 1 : -1;

      // 优先避免出分牌
      const ap = getCardPointValue(a);
      const bp = getCardPointValue(b);
      if (ap !== bp) return ap - bp;

      // 拆对惩罚：只有当对子可以保留时才考虑
      // 如果 count > remaining，说明对子无论如何都会被拆掉，不应该有惩罚
      const aCount = keyCount.get(getCardKey(a)) || 1;
      const bCount = keyCount.get(getCardKey(b)) || 1;
      const aBreak = aCount > 1 && aCount <= remaining ? 1 : 0;
      const bBreak = bCount > 1 && bCount <= remaining ? 1 : 0;
      if (aBreak !== bBreak) return aBreak - bBreak;

      return compareCardsForStrategy(a, b, ctx);
    })
    .slice(0, need);
}

function canBeatCurrentWinner(myCards: Card[], winnerCards: Card[], ctx: GameContext): boolean {
  const win = getWinningPlayCore([
    { seat: 'east', cards: winnerCards },
    { seat: 'west', cards: myCards }
  ], ctx);
  return win.seat === 'west';
}

function compareLosingCandidates(
  a: Card[],
  b: Card[],
  partnerLeading: boolean,
  suitCards: Card[],
  ctx: GameContext
): number {
  const aBreak = getComboBreakPenalty(a, suitCards, ctx);
  const bBreak = getComboBreakPenalty(b, suitCards, ctx);
  if (aBreak !== bBreak) return aBreak - bBreak;

  const aPts = getCardsPointValue(a);
  const bPts = getCardsPointValue(b);
  if (aPts !== bPts) {
    return partnerLeading ? (bPts - aPts) : (aPts - bPts);
  }

  const aVal = a.reduce((s, c) => s + getCardValueForStrategy(c, ctx), 0);
  const bVal = b.reduce((s, c) => s + getCardValueForStrategy(c, ctx), 0);
  return aVal - bVal;
}

export function followCardsStrategy(
  hand: Card[],
  leadCards: Card[],
  currentPlays: Array<{ seat: Seat; cards: Card[] }>,
  mySeat: Seat,
  ctx: GameContext
): Card[] {
  const leadSuit = getPlaySuit(leadCards, ctx);
  const suitCards = hand.filter(c => {
    const cls = classifyCard(c, ctx);
    if (leadSuit === 'trump') return cls === 'trump';
    return cls !== 'trump' && (cls as { suit: string }).suit === leadSuit;
  });

  const currentWinner = getWinningPlayCore(currentPlays, ctx);
  const partnerLeading = isPartner(currentWinner.seat, mySeat);
  const partnerLed = isPartner(currentPlays[0].seat, mySeat);
  const isSecondOrThird = currentPlays.length === 1 || currentPlays.length === 2;
  const preferLargestCover = isSecondOrThird && COVER_MODE === 'aggressive';

  // partner currently wins and I am void in lead suit: donate safely, avoid burning trumps/jokers
  if (partnerLeading && suitCards.length === 0) {
    return chooseFillersForPartnerLead(hand, hand, leadCards.length, ctx);
  }

  // partner led and I cannot fully follow suit -> donate points without breaking structure
  if (partnerLed && suitCards.length > 0 && suitCards.length < leadCards.length) {
    const needFill = leadCards.length - suitCards.length;
    const otherCards = hand.filter(c => !suitCards.includes(c));
    return [...suitCards, ...chooseFillersForPartnerLead(hand, otherCards, needFill, ctx)];
  }

  // enemy led and I cannot fully follow suit -> safe filler, avoid wasting 5/trumps
  if (!partnerLed && suitCards.length > 0 && suitCards.length < leadCards.length) {
    const needFill = leadCards.length - suitCards.length;
    const otherCards = hand.filter(c => !suitCards.includes(c));
    return [...suitCards, ...buildSafeVoidDump(otherCards, needFill, ctx)];
  }

  // single special
  if (!partnerLeading && leadCards.length === 1 && suitCards.length > 0) {
    const wins = suitCards.filter(c => canBeatCurrentWinner([c], currentWinner.cards, ctx)).sort((a, b) => compareCardsForStrategy(a, b, ctx));
    if (wins.length > 0) {
      if (preferLargestCover) return [wins[wins.length - 1]];
      const cnt = new Map<string, number>();
      for (const c of suitCards) cnt.set(getCardKey(c), (cnt.get(getCardKey(c)) || 0) + 1);
      const noBreak = wins.filter(c => (cnt.get(getCardKey(c)) || 1) === 1);
      return [noBreak.length > 0 ? noBreak[0] : wins[0]];
    }
  }

  // void and enemy leads: aggressive kill
  if (!partnerLeading && suitCards.length === 0) {
    const trumpCards = hand.filter(c => classifyCard(c, ctx) === 'trump');
    const killCandidates = buildCandidatesFromSuit(trumpCards, leadCards, ctx).filter(c => c.length === leadCards.length);
    const winningKills = killCandidates.filter(c => canBeatCurrentWinner(c, currentWinner.cards, ctx));
    if (winningKills.length > 0) {
      winningKills.sort((a, b) => {
        const aBreak = getComboBreakPenalty(a, trumpCards, ctx);
        const bBreak = getComboBreakPenalty(b, trumpCards, ctx);
        if (aBreak !== bBreak) return aBreak - bBreak;
        const aPts = getCardsPointValue(a), bPts = getCardsPointValue(b);
        if (aPts !== bPts) return bPts - aPts;
        const av = a.reduce((s, c) => s + getCardValueForStrategy(c, ctx), 0);
        const bv = b.reduce((s, c) => s + getCardValueForStrategy(c, ctx), 0);
        return av - bv;
      });
      return winningKills[0];
    }

    // cannot kill: safe dump, avoid burning trumps/5s
    return buildSafeVoidDump(hand, leadCards.length, ctx);
  }

  // normal same-suit candidates
  const candidates = buildCandidatesFromSuit(suitCards, leadCards, ctx);
  if (candidates.length > 0) {
    const canBeat = candidates.some(c => canBeatCurrentWinner(c, currentWinner.cards, ctx));
    candidates.sort((a, b) => {
      const aWin = canBeatCurrentWinner(a, currentWinner.cards, ctx);
      const bWin = canBeatCurrentWinner(b, currentWinner.cards, ctx);
      const aVal = a.reduce((s, c) => s + getCardValueForStrategy(c, ctx), 0);
      const bVal = b.reduce((s, c) => s + getCardValueForStrategy(c, ctx), 0);

      if (canBeat) {
        // 搭档领先时，不要beat，选最小的垫牌
        if (partnerLeading) {
          return compareLosingCandidates(a, b, partnerLeading, suitCards, ctx);
        }
        
        if (aWin !== bWin) return aWin ? -1 : 1;

        if (aWin && bWin) {
          const aBreak = getComboBreakPenalty(a, suitCards, ctx);
          const bBreak = getComboBreakPenalty(b, suitCards, ctx);
          if (aBreak !== bBreak) return aBreak - bBreak;
          return preferLargestCover ? (bVal - aVal) : (aVal - bVal);
        }

        return compareLosingCandidates(a, b, partnerLeading, suitCards, ctx);
      }

      return compareLosingCandidates(a, b, partnerLeading, suitCards, ctx);
    });

    const chosen = candidates[0];
    const v = validateFollowPlay(chosen, leadCards, hand, ctx);
    if (v.valid) return chosen;
  }

  // in-suit fallback when normal candidate path didn't produce a legal choice
  if (partnerLeading && suitCards.length >= leadCards.length) {
    const betterDonate = buildPartnerDonationFollow(leadCards, suitCards, ctx);
    if (betterDonate) {
      const v2 = validateFollowPlay(betterDonate, leadCards, hand, ctx);
      if (v2.valid) return betterDonate;
    }

    const keyCount = new Map<string, number>();
    for (const c of suitCards) keyCount.set(getCardKey(c), (keyCount.get(getCardKey(c)) || 0) + 1);

    const donate = [...suitCards]
      .sort((a, b) => {
        const ap = getCardPointValue(a);
        const bp = getCardPointValue(b);
        if (ap !== bp) return bp - ap;

        const aBreak = (keyCount.get(getCardKey(a)) || 1) > 1 ? 1 : 0;
        const bBreak = (keyCount.get(getCardKey(b)) || 1) > 1 ? 1 : 0;
        if (aBreak !== bBreak) return aBreak - bBreak;

        return compareCardsForStrategy(a, b, ctx);
      })
      .slice(0, leadCards.length);

    const v = validateFollowPlay(donate, leadCards, hand, ctx);
    if (v.valid) return donate;
  }

  // generic same-suit fallback
  if (suitCards.length >= leadCards.length) {
    const dump = [...suitCards]
      .sort((a, b) => {
        const ap = getCardPointValue(a);
        const bp = getCardPointValue(b);
        if (ap !== bp) return partnerLeading ? (bp - ap) : (ap - bp);
        return compareCardsForStrategy(a, b, ctx);
      })
      .slice(0, leadCards.length);

    const v = validateFollowPlay(dump, leadCards, hand, ctx);
    if (v.valid) return dump;
  }

  // fallback via core autocompletion
  return autoCompleteFollow([], leadCards, hand, ctx);
}

export function getWinningPlay(
  plays: Array<{ seat: Seat; cards: Card[] }>,
  ctx: GameContext
): { seat: Seat; cards: Card[] } {
  return getWinningPlayCore(plays, ctx);
}
