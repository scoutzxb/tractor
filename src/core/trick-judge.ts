import type { Card, GameContext, Component, ParseResult, Seat, Suit } from './types';
import { parseCards, getPlaySuit } from './parser';
import { classifyCard, cardCompare } from './deck';
import { validateKill } from './kill-validator';

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

/**
 * 从一组牌中提取匹配领牌花色的牌（用于无主局或非主牌领牌时的赢牌判定）
 * 玩家垫牌的牌不应该参与赢牌比较
 */
function extractLeadSuitCards(cards: Card[], leadSuit: Suit, ctx: GameContext): Card[] {
  return cards.filter(card => {
    const cardClass = classifyCard(card, ctx);
    // 只保留与领牌花色匹配的副牌
    if (cardClass === 'trump') return false;
    return (cardClass as { suit: Suit }).suit === leadSuit;
  });
}

function getCardValueForStrategy(card: Card, ctx: GameContext): number {
  if (!card) return -1;
  if (card.joker === 'big') return 1000;
  if (card.joker === 'small') return 999;
  if (card.rank === ctx.level) {
    if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) return 998;
    return 997;
  }
  return RANK_VALUES[card.rank!];
}

function compareCardsForStrategy(a: Card, b: Card, ctx: GameContext): number {
  const aClass = classifyCard(a, ctx);
  const bClass = classifyCard(b, ctx);
  if (aClass === 'trump' && bClass !== 'trump') return 1;
  if (aClass !== 'trump' && bClass === 'trump') return -1;
  return getCardValueForStrategy(a, ctx) - getCardValueForStrategy(b, ctx);
}

/**
 * 按照领牌结构比较两个杀牌的大小
 * 规则：按结构优先级逐个比较对应组件（超级拖拉机>三张>拖拉机>对子>单张）
 * 特殊规则：对于 pair+single 结构，对子相等时先出者胜，不比较单张
 * 当对应组件相同时，先出者胜
 */
function compareKillsByLeadStructure(
  kill1Cards: Card[],
  kill2Cards: Card[],
  leadStructure: ParseResult,
  ctx: GameContext
): number {
  // 解析两个杀牌的结构
  const kill1Parsed = parseCards(kill1Cards, ctx);
  const kill2Parsed = parseCards(kill2Cards, ctx);

  // 按领牌结构顺序逐个比较
  const priority = ['super_tractor', 'triple', 'tractor', 'pair', 'single'];

  for (const leadComp of leadStructure) {
    const leadType = leadComp.type;

    // 在kill1中找匹配类型的组件
    let kill1Comp = kill1Parsed.find(c => c.type === leadType);
    // 在kill2中找匹配类型的组件
    let kill2Comp = kill2Parsed.find(c => c.type === leadType);

    // 如果没有精确匹配，找更高级别的组件（高阶可以杀低阶）
    if (!kill1Comp) {
      const leadTypeIdx = priority.indexOf(leadType);
      for (let i = 0; i < leadTypeIdx; i++) {
        kill1Comp = kill1Parsed.find(c => c.type === priority[i]);
        if (kill1Comp) break;
      }
    }
    if (!kill2Comp) {
      const leadTypeIdx = priority.indexOf(leadType);
      for (let i = 0; i < leadTypeIdx; i++) {
        kill2Comp = kill2Parsed.find(c => c.type === priority[i]);
        if (kill2Comp) break;
      }
    }

    // 如果一家有匹配的组件而另一家没有
    if (kill1Comp && !kill2Comp) return 1;
    if (!kill1Comp && kill2Comp) return -1;
    if (!kill1Comp && !kill2Comp) continue;

    // 比较该组件的最大牌
    const max1 = getMaxCard(kill1Comp!.cards, ctx);
    const max2 = getMaxCard(kill2Comp!.cards, ctx);
    const comp = cardCompare(max1, max2, ctx);
    if (comp !== 0) return comp;

    // 对子+单张结构，对子相等时先出者胜，不比较单张
    if (leadType === 'pair' && leadStructure.some(c => c.type === 'single')) {
      return 0; // 对子相同，先出者胜
    }
    // 其他情况继续比较下一个组件
  }

  // 所有对应组件都相等，返回0（表示相等，先出者胜）
  return 0;
}

function getStructure(components: ParseResult): {
  triples: number;
  pairs: number;
  singles: number;
  tractors: number;
  superTractors: number;
} {
  const structure = { triples: 0, pairs: 0, singles: 0, tractors: 0, superTractors: 0 };
  for (const comp of components) {
    switch (comp.type) {
      case 'triple': structure.triples++; break;
      case 'pair': structure.pairs++; break;
      case 'single': structure.singles++; break;
      case 'tractor': structure.tractors++; break;
      case 'super_tractor': structure.superTractors++; break;
    }
  }
  return structure;
}

function calculateMatchScore(
  structure: { triples: number; pairs: number; singles: number; tractors: number; superTractors: number },
  lead: { triples: number; pairs: number; singles: number; tractors: number; superTractors: number }
): number {
  let score = 0;
  if (
    structure.triples === lead.triples &&
    structure.pairs === lead.pairs &&
    structure.singles === lead.singles &&
    structure.tractors === lead.tractors &&
    structure.superTractors === lead.superTractors
  ) score += 100;
  if (structure.triples >= lead.triples) score += 50;
  if (structure.pairs >= lead.pairs) score += 30;
  if (structure.tractors >= lead.tractors) score += 40;
  if (structure.superTractors >= lead.superTractors) score += 60;
  return score;
}

function compareStructures(
  a: { triples: number; pairs: number; singles: number; tractors: number; superTractors: number },
  b: { triples: number; pairs: number; singles: number; tractors: number; superTractors: number },
  lead: { triples: number; pairs: number; singles: number; tractors: number; superTractors: number }
): number {
  const aMatch = calculateMatchScore(a, lead);
  const bMatch = calculateMatchScore(b, lead);
  if (aMatch !== bMatch) return aMatch - bMatch;
  if (a.superTractors !== b.superTractors) return a.superTractors - b.superTractors;
  if (a.triples !== b.triples) return a.triples - b.triples;
  if (a.tractors !== b.tractors) return a.tractors - b.tractors;
  if (a.pairs !== b.pairs) return a.pairs - b.pairs;
  return 0;
}

function getMaxCard(cards: Card[], ctx: GameContext): Card {
  let maxCard = cards[0];
  for (let i = 1; i < cards.length; i++) {
    if (compareCardsForStrategy(cards[i], maxCard, ctx) > 0) maxCard = cards[i];
  }
  return maxCard;
}

export interface TrickWinResult {
  winner: { seat: Seat; cards: Card[] };
  resolvedStructure: ParseResult;
}

function projectWinningCardsToLeadStructure(
  leadCards: Card[],
  winningCards: Card[],
  ctx: GameContext
): ParseResult {
  const leadParsed = parseCards(leadCards, ctx);
  const sortedWin = [...winningCards].sort((a, b) => compareCardsForStrategy(b, a, ctx));

  const out: ParseResult = [];
  let idx = 0;
  for (const comp of leadParsed) {
    const need = comp.cards.length;
    const part = sortedWin.slice(idx, idx + need);
    if (part.length === need) {
      out.push({
        type: comp.type,
        cards: part,
        length: comp.length
      });
      idx += need;
    }
  }

  if (out.length === 0) return parseCards(winningCards, ctx);
  return out;
}

export function getWinningPlayDetailed(
  plays: Array<{ seat: Seat; cards: Card[] }>,
  ctx: GameContext
): TrickWinResult {
  if (plays.length === 0) throw new Error('No plays to compare');
  if (plays.length === 1) {
    return { winner: plays[0], resolvedStructure: parseCards(plays[0].cards, ctx) };
  }

  const leadPlay = plays[0];
  const leadSuit = getPlaySuit(leadPlay.cards, ctx);
  const leadStructure = getStructure(parseCards(leadPlay.cards, ctx));

  // 提取各家可用于赢牌判定的牌
  // 规则：
  // 1. 领主牌时，只有主牌可以参与比较
  // 2. 领副牌时，先检查是否有合法杀牌（全主牌且结构匹配），有则只比较杀牌
  //    没有杀牌时，只有领牌花色的牌可以参与比较（垫牌不参与）
  let candidatePlays: Array<{ seat: Seat; cards: Card[]; originalCards: Card[] }>;
  
  if (leadSuit === 'trump') {
    // 领主牌：只比较各家出的主牌
    candidatePlays = plays.map(play => {
      const trumpCards = play.cards.filter(c => classifyCard(c, ctx) === 'trump');
      return { seat: play.seat, cards: trumpCards, originalCards: play.cards };
    }).filter(p => p.cards.length > 0);
  } else {
    // 领副牌：先检查是否有杀牌
    const trumpKills = plays.filter(play => {
      const allTrump = play.cards.every(c => classifyCard(c, ctx) === 'trump');
      if (!allTrump) return false;
      return validateKill(leadPlay.cards, play.cards, ctx).valid;
    });
    
    if (trumpKills.length > 0) {
      // 有杀牌：只比较杀牌
      candidatePlays = trumpKills.map(play => ({
        seat: play.seat,
        cards: play.cards,
        originalCards: play.cards
      }));
    } else {
      // 没有杀牌：只比较各家出的领牌花色牌（排除垫牌）
      candidatePlays = plays.map(play => {
        const leadSuitCards = extractLeadSuitCards(play.cards, leadSuit as Suit, ctx);
        return { seat: play.seat, cards: leadSuitCards, originalCards: play.cards };
      }).filter(p => p.cards.length > 0);
    }
  }

  if (candidatePlays.length === 0) {
    return { winner: leadPlay, resolvedStructure: parseCards(leadPlay.cards, ctx) };
  }

  let winning = candidatePlays[0];
  let winningStructure = getStructure(parseCards(winning.cards, ctx));

  for (let i = 1; i < candidatePlays.length; i++) {
    const play = candidatePlays[i];
    const structure = getStructure(parseCards(play.cards, ctx));
    const structureComparison = compareStructures(structure, winningStructure, leadStructure);
    if (structureComparison > 0) {
      winning = play;
      winningStructure = structure;
    } else if (structureComparison === 0) {
      // 结构相同，按照领牌结构逐个比较组件
      const parsedLead = parseCards(leadPlay.cards, ctx);
      const comp = compareKillsByLeadStructure(play.cards, winning.cards, parsedLead, ctx);
      if (comp > 0) {
        winning = play;
        winningStructure = structure;
      }
      // comp === 0 时保持先出者胜（不更新winning）
    }
  }

  let resolvedStructure = parseCards(winning.originalCards, ctx);
  if (leadSuit !== 'trump' && getPlaySuit(winning.originalCards, ctx) === 'trump' && validateKill(leadPlay.cards, winning.originalCards, ctx).valid) {
    resolvedStructure = projectWinningCardsToLeadStructure(leadPlay.cards, winning.originalCards, ctx);
  }

  return { winner: { seat: winning.seat, cards: winning.originalCards }, resolvedStructure };
}

export function getWinningPlay(
  plays: Array<{ seat: Seat; cards: Card[] }>,
  ctx: GameContext
): { seat: Seat; cards: Card[] } {
  return getWinningPlayDetailed(plays, ctx).winner;
}
