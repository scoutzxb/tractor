import type { Card, Rank, TrumpState, Seat } from '../core/types';
import { canDeclare } from '../core/trump-state';

export function tryCounterDeclare(hand: Card[], level: Rank, state: TrumpState, seat: Seat): Card[] | null {
  // Safety check: filter out undefined cards
  const safeHand = hand.filter(c => c && (c.rank || c.joker));
  
  const jokers = safeHand.filter(c => c.joker);
  const levelCards = safeHand.filter(c => c.rank === level && !c.joker);

  const bigJokers = jokers.filter(c => c.joker === 'big');
  if (bigJokers.length >= 3) {
    const cards = bigJokers.slice(0, 3);
    if (canDeclare(state, seat, cards, level, state.isGrabMode ? seat : undefined)) return cards;
  }

  const smallJokers = jokers.filter(c => c.joker === 'small');
  if (smallJokers.length >= 3) {
    const cards = smallJokers.slice(0, 3);
    if (canDeclare(state, seat, cards, level, state.isGrabMode ? seat : undefined)) return cards;
  }

  const levelBySuit = new Map<string, Card[]>();
  for (const card of levelCards) {
    const suit = card.suit!;
    if (!levelBySuit.has(suit)) levelBySuit.set(suit, []);
    levelBySuit.get(suit)!.push(card);
  }

  for (const cards of levelBySuit.values()) {
    if (cards.length >= 3) {
      const candidate = cards.slice(0, 3);
      if (canDeclare(state, seat, candidate, level, state.isGrabMode ? seat : undefined)) return candidate;
    }
  }

  if (bigJokers.length >= 2) {
    const cards = bigJokers.slice(0, 2);
    if (canDeclare(state, seat, cards, level, state.isGrabMode ? seat : undefined)) return cards;
  }

  if (smallJokers.length >= 2) {
    const cards = smallJokers.slice(0, 2);
    if (canDeclare(state, seat, cards, level, state.isGrabMode ? seat : undefined)) return cards;
  }

  for (const cards of levelBySuit.values()) {
    if (cards.length >= 2) {
      const candidate = cards.slice(0, 2);
      if (canDeclare(state, seat, candidate, level, state.isGrabMode ? seat : undefined)) return candidate;
    }
  }

  return null;
}

export function chooseTrump(hand: Card[], level: Rank, state: TrumpState, seat: Seat): Card[] | null {
  // Safety check: filter out undefined cards
  const safeHand = hand.filter(c => c && (c.rank || c.joker));
  
  if (state.currentTrump) {
    if (!state.isGrabMode) return null;
    return tryCounterDeclare(safeHand, level, state, seat);
  }
  const levelCards = safeHand.filter(c => c.rank === level && !c.joker);
  if (levelCards.length >= 1) return levelCards.slice(0, 1);
  return null;
}
