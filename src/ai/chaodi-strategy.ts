import type { Card, Rank, TrumpState, Seat } from '../core/types';
import { canChaoDi } from '../core/trump-state';

export function chooseChaoDi(hand: Card[], level: Rank, state: TrumpState, seat: Seat): Card[] | null {
  // Filter out undefined/null cards
  const validHand = hand.filter(c => c != null);
  
  const jokers = validHand.filter(c => c.joker);
  const levelCards = validHand.filter(c => c.rank === level && !c.joker);

  const bigJokers = jokers.filter(c => c.joker === 'big');
  if (bigJokers.length >= 3) {
    const cards = bigJokers.slice(0, 3);
    if (canChaoDi(state, seat, cards, level)) return cards;
  }

  const smallJokers = jokers.filter(c => c.joker === 'small');
  if (smallJokers.length >= 3) {
    const cards = smallJokers.slice(0, 3);
    if (canChaoDi(state, seat, cards, level)) return cards;
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
      if (canChaoDi(state, seat, candidate, level)) return candidate;
    }
  }

  if (bigJokers.length >= 2) {
    const cards = bigJokers.slice(0, 2);
    if (canChaoDi(state, seat, cards, level)) return cards;
  }

  if (smallJokers.length >= 2) {
    const cards = smallJokers.slice(0, 2);
    if (canChaoDi(state, seat, cards, level)) return cards;
  }

  for (const cards of levelBySuit.values()) {
    if (cards.length >= 2) {
      const candidate = cards.slice(0, 2);
      if (canChaoDi(state, seat, candidate, level)) return candidate;
    }
  }

  return null;
}
