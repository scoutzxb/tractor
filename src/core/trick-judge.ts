import type { Card, GameContext, Component, ParseResult, Seat } from './types';
import { parseCards, getPlaySuit } from './parser';
import { classifyCard } from './deck';
import { validateKill } from './kill-validator';

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

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

  let candidatePlays: Array<{ seat: Seat; cards: Card[] }>;
  if (leadSuit !== 'trump') {
    const legalTrumpKills = plays.filter(play => {
      if (getPlaySuit(play.cards, ctx) !== 'trump') return false;
      return validateKill(leadPlay.cards, play.cards, ctx).valid;
    });
    candidatePlays = legalTrumpKills.length > 0
      ? legalTrumpKills
      : plays.filter(play => getPlaySuit(play.cards, ctx) === leadSuit);
  } else {
    candidatePlays = plays.filter(play => getPlaySuit(play.cards, ctx) === 'trump');
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
      const maxCardComparison = compareCardsForStrategy(
        getMaxCard(play.cards, ctx),
        getMaxCard(winning.cards, ctx),
        ctx
      );
      if (maxCardComparison > 0) {
        winning = play;
        winningStructure = structure;
      }
    }
  }

  let resolvedStructure = parseCards(winning.cards, ctx);
  if (leadSuit !== 'trump' && getPlaySuit(winning.cards, ctx) === 'trump' && validateKill(leadPlay.cards, winning.cards, ctx).valid) {
    resolvedStructure = projectWinningCardsToLeadStructure(leadPlay.cards, winning.cards, ctx);
  }

  return { winner: winning, resolvedStructure };
}

export function getWinningPlay(
  plays: Array<{ seat: Seat; cards: Card[] }>,
  ctx: GameContext
): { seat: Seat; cards: Card[] } {
  return getWinningPlayDetailed(plays, ctx).winner;
}
