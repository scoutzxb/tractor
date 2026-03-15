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
    if (ap !== bp) return ap - bp;

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

  // Analyze lead components
  const leadInfo = analyzeLeadComponents(comps);
  const parsed = parseCards(suitCards, ctx);
  const enumerated = enumerateCards(suitCards, ctx);

  // === SUPER TRACTOR MATCHING ===
  if (leadInfo.type === 'super_tractor') {
    return buildSuperTractorCandidates(suitCards, leadInfo, enumerated, parsed, ctx);
  }

  // === TRIPLE MATCHING ===
  if (leadInfo.type === 'triple') {
    return buildTripleCandidates(suitCards, leadInfo, enumerated, parsed, ctx);
  }

  // === TRACTOR MATCHING ===
  if (leadInfo.type === 'tractor') {
    return buildTractorCandidates(suitCards, leadInfo, enumerated, parsed, ctx);
  }

  // === PAIR MATCHING ===
  if (leadInfo.type === 'pair') {
    return buildPairCandidates(suitCards, leadInfo, enumerated, parsed, ctx);
  }

  // === MIXED STRUCTURES (甩牌) ===
  return buildMixedCandidates(suitCards, leadInfo, enumerated, parsed, ctx);
}

// Helper types for lead analysis
interface LeadInfo {
  type: 'super_tractor' | 'triple' | 'tractor' | 'pair' | 'mixed';
  count: number;  // number of structures (e.g., 2 for super_tractor len=2)
  length?: number;  // for tractor/super_tractor: the length of the chain
  totalCards: number;
  components: Array<{ type: string; count: number; length?: number }>;
}

function analyzeLeadComponents(comps: ParseResult): LeadInfo {
  if (comps.length === 1) {
    const c = comps[0];
    if (c.type === 'super_tractor') {
      const len = c.length || Math.floor(c.cards.length / 3);
      return { type: 'super_tractor', count: 1, length: len, totalCards: c.cards.length, components: [{ type: 'super_tractor', count: 1, length: len }] };
    }
    if (c.type === 'triple') {
      return { type: 'triple', count: 1, totalCards: 3, components: [{ type: 'triple', count: 1 }] };
    }
    if (c.type === 'tractor') {
      const len = c.length || Math.floor(c.cards.length / 2);
      return { type: 'tractor', count: 1, length: len, totalCards: c.cards.length, components: [{ type: 'tractor', count: 1, length: len }] };
    }
    if (c.type === 'pair') {
      return { type: 'pair', count: 1, totalCards: 2, components: [{ type: 'pair', count: 1 }] };
    }
  }

  // Mixed structure (甩牌)
  const components: Array<{ type: string; count: number; length?: number }> = [];
  let totalCards = 0;
  
  for (const c of comps) {
    if (c.type === 'super_tractor') {
      const len = c.length || Math.floor(c.cards.length / 3);
      components.push({ type: 'super_tractor', count: 1, length: len });
      totalCards += len * 3;
    } else if (c.type === 'triple') {
      components.push({ type: 'triple', count: 1 });
      totalCards += 3;
    } else if (c.type === 'tractor') {
      const len = c.length || Math.floor(c.cards.length / 2);
      components.push({ type: 'tractor', count: 1, length: len });
      totalCards += len * 2;
    } else if (c.type === 'pair') {
      components.push({ type: 'pair', count: 1 });
      totalCards += 2;
    } else if (c.type === 'single') {
      components.push({ type: 'single', count: 1 });
      totalCards += 1;
    }
  }

  return { type: 'mixed', count: components.length, totalCards, components };
}

// === SUPER TRACTOR CANDIDATES ===
function buildSuperTractorCandidates(
  suitCards: Card[],
  leadInfo: LeadInfo,
  enumerated: ReturnType<typeof enumerateCards>,
  parsed: ParseResult,
  ctx: GameContext
): Card[][] {
  const needLen = leadInfo.length || 2;
  const need = leadInfo.totalCards;
  const pairs = parsed.filter(c => c.type === 'pair');
  const triples = parsed.filter(c => c.type === 'triple');
  const out: Card[][] = [];

  // 1. Exact super tractor match (longest to shortest)
  const exactMatches = enumerated.superTractors
    .filter(chain => chain.length >= needLen)
    .sort((a, b) => b.length - a.length);
  
  for (const chain of exactMatches) {
    const cards = chain.slice(0, needLen).flatMap(c => c.cards);
    if (cards.length === need) {
      out.push(cards);
    }
  }

  if (out.length > 0) return out;

  // Downgrade order for super tractor:
  // 2. shorter supertractor (longest) + shorter supertractor or triple
  // 3. triple (same number as super tractor length)
  // 4. triple + tractor + single / triple + pair + single
  // 5. tractor (same length) + single
  // 6. tractor (shorter) + pair + single
  // 7. tractor (shorter) + single
  // 8. pair (same number as supertractor length) + single
  // 9. pair (less than supertractor length) + single
  // 10. pure single

  // Check if we have enough triples to cover
  if (triples.length >= needLen) {
    // Option: use triples (option 3)
    const selected: Card[] = [];
    for (let i = 0; i < needLen && i < triples.length; i++) {
      selected.push(...triples[i].cards);
    }
    if (selected.length === need) {
      out.push(selected);
    }
  }

  // Check for shorter super tractor + triple (option 2)
  if (enumerated.superTractors.length > 0 && triples.length > 0) {
    for (const chain of enumerated.superTractors) {
      const chainLen = chain.length;
      if (chainLen < needLen) {
        const shortSuperCards = chain.flatMap(c => c.cards);
        const remainingNeed = need - shortSuperCards.length;
        
        // Try another shorter super tractor
        for (const chain2 of enumerated.superTractors) {
          if (chain2 !== chain && chain2.length * 3 === remainingNeed) {
            const cards = [...shortSuperCards, ...chain2.flatMap(c => c.cards)];
            if (cards.length === need) out.push(cards);
          }
        }
        
        // Or try triple
        if (remainingNeed === 3 && triples.length > 0) {
          for (const t of triples) {
            const cards = [...shortSuperCards, ...t.cards];
            if (cards.length === need) out.push(cards);
          }
        }
      }
    }
  }

  // Triple + pair + single combinations (option 4)
  // This is complex; simplified: try to use triples + pairs to cover
  if (triples.length > 0 && pairs.length > 0) {
    for (const t of triples) {
      const remainingNeed = need - 3;
      if (remainingNeed === 2 && pairs.length > 0) {
        for (const p of pairs) {
          const cards = [...t.cards, ...p.cards];
          if (cards.length === need) out.push(cards);
        }
      } else if (remainingNeed > 0) {
        // triple + fillers
        const remainingCards = suitCards.filter(c => !t.cards.includes(c));
        if (remainingCards.length >= remainingNeed) {
          for (let i = 0; i <= remainingCards.length - remainingNeed; i++) {
            const fillers = remainingCards.slice(i, i + remainingNeed);
            out.push([...t.cards, ...fillers]);
          }
        }
      }
    }
  }

  // Tractor (same or shorter length) + singles (option 5-7)
  const tractors = parsed.filter(c => c.type === 'tractor');
  for (const t of tractors) {
    const tLen = t.length || Math.floor(t.cards.length / 2);
    const tCards = t.cards.slice(0, tLen * 2);
    const remainingNeed = need - tCards.length;
    
    if (remainingNeed >= 0) {
      const remainingCards = suitCards.filter(c => !tCards.includes(c));
      if (remainingCards.length >= remainingNeed) {
        // Use remaining cards as fillers
        for (let i = 0; i <= remainingCards.length - remainingNeed; i++) {
          const fillers = remainingCards.slice(i, i + remainingNeed);
          const candidate = [...tCards, ...fillers];
          if (candidate.length === need) out.push(candidate);
        }
      }
    }
  }

  // Tractor (same or shorter length) + pair from another tractor (option 7.5)
  // 关键场景：跟3连拖拉机需要3对，但只有2连拖拉机时，拆另一个拖拉机来补足
  for (const t1 of tractors) {
    const t1Len = t1.length || Math.floor(t1.cards.length / 2);
    const t1Cards = t1.cards.slice(0, t1Len * 2);
    const remainingNeed = need - t1Cards.length;
    
    if (remainingNeed === 2) {
      // 需要从其他拖拉机拆出1对
      for (const t2 of tractors) {
        if (t2 === t1) continue;  // 跳过自己
        const t2Len = t2.length || Math.floor(t2.cards.length / 2);
        if (t2Len >= 1) {
          // 从另一个拖拉机拆出1对
          const pairFromT2 = t2.cards.slice(0, 2);
          const candidate = [...t1Cards, ...pairFromT2];
          if (candidate.length === need) out.push(candidate);
        }
      }
    }
  }

  // Pairs + singles (option 8-9)
  if (pairs.length >= needLen) {
    const selected: Card[] = [];
    for (let i = 0; i < needLen && i < pairs.length; i++) {
      selected.push(...pairs[i].cards);
    }
    const remainingNeed = need - selected.length;
    const remainingCards = suitCards.filter(c => !selected.includes(c));
    if (remainingCards.length >= remainingNeed) {
      for (let i = 0; i <= remainingCards.length - remainingNeed; i++) {
        const fillers = remainingCards.slice(i, i + remainingNeed);
        out.push([...selected, ...fillers]);
      }
    }
  }

  // Pure singles (option 10)
  if (out.length === 0 && suitCards.length >= need) {
    const singles = generateCombinations(suitCards, need);
    out.push(...singles);
  }

  return out.length > 0 ? out : [];
}

// === TRIPLE CANDIDATES ===
function buildTripleCandidates(
  suitCards: Card[],
  leadInfo: LeadInfo,
  enumerated: ReturnType<typeof enumerateCards>,
  parsed: ParseResult,
  ctx: GameContext
): Card[][] {
  const out: Card[][] = [];
  const pairs = parsed.filter(c => c.type === 'pair');

  // 1. Exact triple match
  for (const t of enumerated.triples) {
    out.push([...t.cards]);
  }

  if (out.length > 0) return out;

  // Downgrade for triple:
  // 1. pair + single
  // 2. pure single

  for (const p of pairs) {
    const remainingCards = suitCards.filter(c => !p.cards.includes(c));
    for (const single of remainingCards) {
      out.push([...p.cards, single]);
    }
  }

  if (out.length > 0) return out;

  // Pure singles (any 3 cards)
  if (suitCards.length >= 3) {
    const singles = generateCombinations(suitCards, 3);
    out.push(...singles);
  }

  return out;
}

// === TRACTOR CANDIDATES ===
function buildTractorCandidates(
  suitCards: Card[],
  leadInfo: LeadInfo,
  enumerated: ReturnType<typeof enumerateCards>,
  parsed: ParseResult,
  ctx: GameContext
): Card[][] {
  const needLen = leadInfo.length || 2;
  const need = leadInfo.totalCards;
  const pairs = parsed.filter(c => c.type === 'pair');
  const tractors = parsed.filter(c => c.type === 'tractor');
  const out: Card[][] = [];

  // 1. Exact tractor match (longest to shortest)
  const exactMatches = enumerated.tractors
    .filter(chain => chain.length >= needLen)
    .sort((a, b) => b.length - a.length);
  
  for (const chain of exactMatches) {
    const cards = chain.slice(0, needLen).flatMap(c => c.cards);
    if (cards.length === need) {
      out.push(cards);
    }
  }

  if (out.length > 0) return out;

  // Downgrade for tractor:
  // 1. tractor of shorter length + pair
  // 2. tractor of shorter length + pair + single
  // 3. pairs of same number as tractor length
  // 4. pair + single
  // 5. pure single

  // Shorter tractor + pairs/singles
  for (const t of tractors) {
    const tLen = t.length || Math.floor(t.cards.length / 2);
    if (tLen < needLen) {
      const tCards = t.cards.slice(0, tLen * 2);
      const remainingNeed = need - tCards.length;
      const remainingCards = suitCards.filter(c => !tCards.includes(c));
      
      if (remainingCards.length >= remainingNeed) {
        for (let i = 0; i <= remainingCards.length - remainingNeed; i++) {
          const fillers = remainingCards.slice(i, i + remainingNeed);
          out.push([...tCards, ...fillers]);
        }
      }
    }
  }

  // Pairs of same number as tractor length
  if (pairs.length >= needLen) {
    const selected: Card[] = [];
    for (let i = 0; i < needLen && i < pairs.length; i++) {
      selected.push(...pairs[i].cards);
    }
    if (selected.length === need) {
      out.push(selected);
    }
  }

  // Pair + single (if we only have 1 pair but need 4 cards for tractor len=2)
  if (need === 4 && pairs.length >= 1) {
    for (const p of pairs) {
      const remainingCards = suitCards.filter(c => !p.cards.includes(c));
      if (remainingCards.length >= 2) {
        for (let i = 0; i <= remainingCards.length - 2; i++) {
          out.push([...p.cards, remainingCards[i], remainingCards[i + 1]]);
        }
      }
    }
  }

  // Pure singles
  if (out.length === 0 && suitCards.length >= need) {
    const singles = generateCombinations(suitCards, need);
    out.push(...singles);
  }

  return out;
}

// === PAIR CANDIDATES ===
function buildPairCandidates(
  suitCards: Card[],
  leadInfo: LeadInfo,
  enumerated: ReturnType<typeof enumerateCards>,
  parsed: ParseResult,
  ctx: GameContext
): Card[][] {
  const out: Card[][] = [];

  // 1. Exact pair matches
  for (const p of enumerated.pairs) {
    out.push([...p.cards]);
  }

  if (out.length > 0) return out;

  // Downgrade: pure singles (any 2 cards)
  if (suitCards.length >= 2) {
    const singles = generateCombinations(suitCards, 2);
    out.push(...singles);
  }

  return out;
}

// === MIXED CANDIDATES (甩牌跟牌) ===
function buildMixedCandidates(
  suitCards: Card[],
  leadInfo: LeadInfo,
  enumerated: ReturnType<typeof enumerateCards>,
  parsed: ParseResult,
  ctx: GameContext
): Card[][] {
  const need = leadInfo.totalCards;
  const out: Card[][] = [];
  
  // For mixed structures, we need to match each component
  // Priority: super_tractor > triple > tractor > pair > single
  
  // Build a list of required structures
  const required: Array<{ type: string; length?: number }> = [];
  for (const comp of leadInfo.components) {
    for (let i = 0; i < comp.count; i++) {
      required.push({ type: comp.type, length: comp.length });
    }
  }
  
  // Sort by priority
  const priority = { super_tractor: 5, triple: 4, tractor: 3, pair: 2, single: 1 };
  required.sort((a, b) => (priority[b.type as keyof typeof priority] || 0) - (priority[a.type as keyof typeof priority] || 0));

  // Try to match structures one by one
  const available = {
    superTractors: enumerated.superTractors,
    triples: parsed.filter(c => c.type === 'triple'),
    tractors: parsed.filter(c => c.type === 'tractor'),
    pairs: parsed.filter(c => c.type === 'pair'),
    singles: parsed.filter(c => c.type === 'single')
  };

  // Generate all combinations of matching the required structures
  const candidates = generateMixedCandidates(suitCards, required, available, need, ctx);
  out.push(...candidates);

  // If no valid combinations, fall back to any combination
  if (out.length === 0 && suitCards.length >= need) {
    const singles = generateCombinations(suitCards, need);
    out.push(...singles);
  }

  return out;
}

function generateMixedCandidates(
  suitCards: Card[],
  required: Array<{ type: string; length?: number }>,
  available: {
    superTractors: Array<Array<Component>>;
    triples: ParseResult;
    tractors: ParseResult;
    pairs: ParseResult;
    singles: ParseResult;
  },
  totalNeed: number,
  ctx: GameContext
): Card[][] {
  const results: Card[][] = [];
  
  // Helper to get cards for a structure type
  function getStructureCards(type: string, length?: number): Card[][] {
    switch (type) {
      case 'super_tractor':
        return available.superTractors
          .filter(chain => chain.length >= (length || 2))
          .map(chain => chain.slice(0, length || 2).flatMap(c => c.cards));
      case 'triple':
        return available.triples.map(t => [...t.cards]);
      case 'tractor':
        return available.tractors
          .filter(t => (t.length || Math.floor(t.cards.length / 2)) >= (length || 2))
          .map(t => t.cards.slice(0, (length || 2) * 2));
      case 'pair':
        return available.pairs.map(p => [...p.cards]);
      case 'single':
        return available.singles.map(s => [...s.cards]);
      default:
        return [];
    }
  }

  // Try each required structure
  for (const req of required) {
    const options = getStructureCards(req.type, req.length);
    for (const option of options) {
      const remainingCards = suitCards.filter(c => !option.includes(c));
      const remainingNeed = totalNeed - option.length;
      
      if (remainingNeed === 0) {
        results.push(option);
      } else if (remainingNeed > 0 && remainingCards.length >= remainingNeed) {
        // Fill remaining with any cards
        const remainingRequired = required.filter(r => r !== req);
        if (remainingRequired.length === 0) {
          // No more structure requirements, use any cards
          for (let i = 0; i <= remainingCards.length - remainingNeed; i++) {
            results.push([...option, ...remainingCards.slice(i, i + remainingNeed)]);
          }
        } else {
          // Recursively match remaining structures
          const subResults = generateMixedCandidates(
            remainingCards,
            remainingRequired,
            {
              superTractors: available.superTractors.filter(chain => 
                !chain.some(c => option.some(oc => c.cards.some(cc => cc.id === oc.id)))),
              triples: available.triples.filter(t => !t.cards.some(c => option.some(oc => c.id === oc.id))),
              tractors: available.tractors.filter(t => !t.cards.some(c => option.some(oc => c.id === oc.id))),
              pairs: available.pairs.filter(p => !p.cards.some(c => option.some(oc => c.id === oc.id))),
              singles: available.singles.filter(s => !s.cards.some(c => option.some(oc => c.id === oc.id)))
            },
            remainingNeed,
            ctx
          );
          for (const sub of subResults) {
            results.push([...option, ...sub]);
          }
        }
      }
    }
  }

  return results;
}

// Generate all combinations of k cards from arr
function generateCombinations(arr: Card[], k: number): Card[][] {
  const out: Card[][] = [];
  
  function combine(start: number, current: Card[]): void {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }
  
  combine(0, []);
  return out;
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
  // 1. 优先出尽可能多的对子结构（规则要求）
  const aPairs = countPairsByKey(a);
  const bPairs = countPairsByKey(b);
  if (aPairs !== bPairs) return bPairs - aPairs; // 对子数多的优先

  // 2. 拆对惩罚（策略优化）
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
        if (ap !== bp) return partnerLeading ? (bp - ap) : (ap - bp);
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
