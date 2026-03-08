import type { Card, GameContext, Seat } from '../core/types';
import { calculateResult, getPartner, getPointCards, resolvePostRoundState } from '../core/scoring';
import { getWinningPlay, getWinningPlayDetailed } from '../core/trick-judge';
import { validateLeadPlay } from '../core/lead-validator';
import { validateFollowPlay, autoCompleteFollow } from '../core/follow-validator';
import type { ParseResult } from '../core/types';

export interface TrickRecord {
  round: number;
  leader: Seat;
  playOrder: Seat[];
  plays: Array<{ seat: Seat; cards: Card[] }>;
  winner: Seat;
  roundScore: number;
  scoresAfter: Map<Seat, number>;
  handsAfter: Map<Seat, Card[]>;
  throwFailure?: {
    seat: Seat;
    attemptedCards: Card[];
    fallbackCards: Card[];
    reason?: string;
  };
}

export interface SimulationInput {
  seats: Seat[];
  dealer: Seat;
  level: any;
  teamLevels: { eastWest: any; northSouth: any };
  ctx: GameContext;
  kitty: Card[];
  hands: Map<Seat, Card[]>;
  strictValidation?: boolean;
  leadStrategy: (hand: Card[], ctx: GameContext) => Card[];
  followStrategy: (
    hand: Card[],
    leadCards: Card[],
    currentPlays: Array<{ seat: Seat; cards: Card[] }>,
    mySeat: Seat,
    ctx: GameContext
  ) => Card[];
}

export interface SimulationResult {
  tricks: TrickRecord[];
  scores: Map<Seat, number>;
  finalHands: Map<Seat, Card[]>;
  dealerTeamScore: number;
  defenderTeamScore: number;
  kittyBonus: { applied: boolean; baseScore: number; multiplier: number; addedScore: number };
  settle: ReturnType<typeof calculateResult>;
  postRoundState: ReturnType<typeof resolvePostRoundState>;
}

function getCardScore(card: Card): number {
  if (!card) return 0;
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

function calcRoundScore(plays: Array<{ seat: Seat; cards: Card[] }>): number {
  return plays.reduce((sum, p) => sum + p.cards.reduce((s, c) => s + getCardScore(c), 0), 0);
}

function createPlayOrder(seats: Seat[], leader: Seat): Seat[] {
  const idx = seats.indexOf(leader);
  return [...seats.slice(idx), ...seats.slice(0, idx)];
}

function cloneHands(hands: Map<Seat, Card[]>): Map<Seat, Card[]> {
  const out = new Map<Seat, Card[]>();
  for (const [k, v] of hands.entries()) out.set(k, [...v]);
  return out;
}

export function playOutHands(input: SimulationInput): SimulationResult {
  const { seats, dealer, level, teamLevels, ctx, kitty, leadStrategy, followStrategy } = input;
  const strictValidation = input.strictValidation === true;
  const hands = cloneHands(input.hands);
  const scores = new Map<Seat, number>();
  for (const s of seats) scores.set(s, 0);

  const tricks: TrickRecord[] = [];
  let leader = dealer;
  let round = 0;
  let lastRoundWinnerSeat: Seat | null = null;
  let lastRoundWinningCards: Card[] = [];
  let lastRoundResolvedStructure: ParseResult = [];

  while (round < 39) {
    round += 1;
    const order = createPlayOrder(seats, leader);
    const leaderHand = hands.get(leader) || [];
    if (leaderHand.length === 0) break;

    const plays: Array<{ seat: Seat; cards: Card[] }> = [];
    let leadCards = leadStrategy(leaderHand, ctx);
    const attemptedLeadCards = [...leadCards];
    let throwFailure: TrickRecord['throwFailure'] | undefined;

    const otherHands = order.slice(1).map(s => hands.get(s) || []);
    const leadValidation = validateLeadPlay(leadCards, otherHands as any, ctx);
    if (!leadValidation.valid && leadValidation.failedComponent) {
      leadCards = [...leadValidation.failedComponent.cards];
      throwFailure = {
        seat: leader,
        attemptedCards: attemptedLeadCards,
        fallbackCards: [...leadCards],
        reason: leadValidation.reason
      };
    }

    plays.push({ seat: leader, cards: leadCards });

    for (let i = 1; i < order.length; i++) {
      const seat = order[i];
      const hand = hands.get(seat) || [];
      if (hand.length === 0) continue;

      let cards = followStrategy(hand, leadCards, plays, seat, ctx);

      // 跟牌必须与首家同张数；不合法时自动修正
      if (cards.length !== leadCards.length) {
        if (strictValidation) {
          throw new Error(`StrictValidationError: round=${round}, seat=${seat}, reason=跟牌张数必须与首家一致, expected=${leadCards.length}, actual=${cards.length}`);
        }
        cards = autoCompleteFollow([], leadCards, hand, ctx);
      }

      const followValid = validateFollowPlay(cards, leadCards, hand, ctx);
      if (!followValid.valid) {
        if (strictValidation) {
          throw new Error(`StrictValidationError: round=${round}, seat=${seat}, reason=${followValid.reason || '跟牌不合法'}, expected=${leadCards.length}, actual=${cards.length}`);
        }
        cards = autoCompleteFollow([], leadCards, hand, ctx);
      }

      if (cards.length > leadCards.length) {
        if (strictValidation) {
          throw new Error(`StrictValidationError: round=${round}, seat=${seat}, reason=跟牌张数超过首家, expected=${leadCards.length}, actual=${cards.length}`);
        }
        cards = cards.slice(0, leadCards.length);
      }

      plays.push({ seat, cards });
    }

    const win = getWinningPlayDetailed(plays, ctx);
    const winning = win.winner;
    const roundScore = calcRoundScore(plays);
    scores.set(winning.seat, (scores.get(winning.seat) || 0) + roundScore);

    for (const play of plays) {
      const hand = hands.get(play.seat) || [];
      hands.set(play.seat, hand.filter(c => !play.cards.includes(c)));
    }

    leader = winning.seat;
    lastRoundWinnerSeat = winning.seat;
    lastRoundWinningCards = [...winning.cards];
    lastRoundResolvedStructure = [...win.resolvedStructure];

    tricks.push({
      round,
      leader: order[0],
      playOrder: order,
      plays: plays.map(p => ({ seat: p.seat, cards: [...p.cards] })),
      winner: winning.seat,
      roundScore,
      scoresAfter: new Map(scores),
      handsAfter: cloneHands(hands),
      throwFailure
    });
  }

  const dealerPartner = getPartner(dealer);
  const dealerTeamScore = (scores.get(dealer) || 0) + (scores.get(dealerPartner) || 0);
  const rawDefenderScore = seats
    .filter(s => s !== dealer && s !== dealerPartner)
    .reduce((sum, s) => sum + (scores.get(s) || 0), 0);

  const lastRoundWinnerSide: 'attack' | 'defense' =
    lastRoundWinnerSeat && lastRoundWinnerSeat !== dealer && lastRoundWinnerSeat !== dealerPartner
      ? 'attack'
      : 'defense';

  const settle = calculateResult(
    rawDefenderScore,
    kitty,
    lastRoundWinnerSide,
    lastRoundWinningCards,
    {
      ...ctx,
      dealer,
      teamLevels
    },
    lastRoundResolvedStructure
  );

  const postRoundState = resolvePostRoundState(
    settle,
    dealer,
    teamLevels
  );

  const kittyBase = getPointCards(kitty);
  const kittyBonus = {
    applied: settle.kittyScore > 0,
    baseScore: kittyBase,
    multiplier: kittyBase > 0 ? Math.floor(settle.kittyScore / kittyBase) : 1,
    addedScore: settle.kittyScore
  };

  const defenderTeamScore = settle.totalScore;

  if (settle.kittyScore > 0 && lastRoundWinnerSeat) {
    scores.set(lastRoundWinnerSeat, (scores.get(lastRoundWinnerSeat) || 0) + settle.kittyScore);
  }

  return {
    tricks,
    scores,
    finalHands: hands,
    dealerTeamScore,
    defenderTeamScore,
    kittyBonus,
    settle,
    postRoundState
  };
}
