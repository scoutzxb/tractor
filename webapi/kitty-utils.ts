/**
 * Unified Kitty Handling - Shared logic for dealer kitty (take + discard)
 * Both AI and human dealers use this same process.
 * Only difference: how the 6 discard cards are selected.
 */

import type { Card, Seat, GameContext } from "../src/core/types";
import type { Session } from "../../web-deal-service";
import { smartDiscardKittyWithDealerInfo } from "../src/ai/smart-discard";
import { autoSaveForSeat, autoSaveForAllPlayers } from "./autosave";

export interface KittyResult {
  success: boolean;
  error?: string;
  seat: Seat;
  received: Card[];
  discarded: Card[];
}

/**
 * Select discard cards using AI strategy
 */
export function selectDiscardWithAI(
  hand: Card[],
  ctx: GameContext,
  seat: Seat,
  dealer: Seat
): Card[] {
  return smartDiscardKittyWithDealerInfo(hand, ctx, 6, seat, dealer);
}

/**
 * Select discard cards from human input (cardIds)
 */
export function selectDiscardWithHumanInput(
  hand: Card[],
  cardIds: number[]
): { cards: Card[]; error?: string } {
  const idSet = new Set(cardIds.map((x: any) => Number(x)));
  const toDiscard = hand.filter((c: Card) => idSet.has(c.id));

  if (toDiscard.length !== 6) {
    return { cards: [], error: `must discard exactly 6 cards, got ${toDiscard.length}` };
  }

  return { cards: toDiscard };
}

/**
 * Execute the full kitty process: take kitty + discard
 * This is the UNIFIED function used by both AI and human dealers.
 *
 * @param session - Game session
 * @param kittyHolder - Seat that takes the kitty
 * @param discardSelector - Either AI selector or human input
 * @returns KittyResult with details of the operation
 */
export function executeKittyProcess(
  session: Session,
  kittyHolder: Seat,
  discardSelector: { type: "ai"; ctx: GameContext; dealer: Seat } | { type: "human"; cardIds: number[] }
): KittyResult {
  const state = session.engine.getState();

  // Step 1: Record what kitty holder will receive (before modifying)
  const receivedKitty = [...state.kitty];

  // Step 2: Add kitty to holder's hand
  const hand = state.hands.get(kittyHolder) || [];
  const handWithKitty = [...hand, ...receivedKitty];

  // Step 3: Select 6 cards to discard (AI strategy OR human input)
  let discardedKitty: Card[];

  if (discardSelector.type === "ai") {
    // AI uses smart discard strategy
    discardedKitty = selectDiscardWithAI(
      handWithKitty,
      discardSelector.ctx,
      kittyHolder,
      discardSelector.dealer
    );
  } else {
    // Human provides card IDs
    const result = selectDiscardWithHumanInput(handWithKitty, discardSelector.cardIds);
    if (result.error) {
      return { success: false, error: result.error, seat: kittyHolder, received: [], discarded: [] };
    }
    discardedKitty = result.cards;
  }

  // Step 4: Update hand (remove discarded cards)
  const discardedIds = new Set(discardedKitty.map((c) => c.id));
  const finalHand = handWithKitty.filter((c) => !discardedIds.has(c.id));

  // Step 5: Update game state
  state.hands.set(kittyHolder, finalHand);
  state.kitty = discardedKitty;

  // Step 6: Log the operation
  if (session.logger) {
    session.logger.recordDealerKitty(kittyHolder, receivedKitty, discardedKitty);
    session.logger.recordKitty(discardedKitty);
    if (state.ctx) {
      session.logger.recordInitialHands(state.hands, state.ctx);
    }
  }

  // Step 7: Flush to file immediately
  if (session.logger && state.ctx) {
    session.logger.flushToFile(state.ctx, state.dealer, session.teamLevels);
  }

  // Step 8: Clear dealerReceivedKitty since we've processed it
  session.dealerReceivedKitty = undefined;

  return {
    success: true,
    seat: kittyHolder,
    received: receivedKitty,
    discarded: discardedKitty,
  };
}

/**
 * Check if a seat is the kitty holder and return appropriate error if not
 */
export function validateKittyHolder(
  session: Session,
  playerSeat: Seat
): { valid: boolean; error?: string; kittyHolder?: Seat } {
  const state = session.engine.getState();
  const kittyHolder = state.trumpState.kittyHolder;

  if (kittyHolder !== playerSeat) {
    return { valid: false, error: "not the kitty holder" };
  }

  return { valid: true, kittyHolder };
}

/**
 * Update session phase after kitty is complete
 * Returns the next phase and initializes chaodi polling if needed
 */
export function advancePhaseAfterKitty(session: Session): {
  nextPhase: "play" | "chaodi";
  currentLeader: Seat;
} {
  const state = session.engine.getState();

  session.awaitingDiscard = false;
  session.currentLeader = state.dealer;

  // In grab mode, go directly to play; otherwise go to chaodi
  const nextPhase = session.isGrabMode ? "play" : "chaodi";
  session.phase = nextPhase;

  if (nextPhase === "play") {
    session.currentTurn = state.dealer;
  } else {
    // Initialize chaodi polling state
    const SEATS = ["east", "north", "west", "south"];
    const getNextSeat = (seat: string) => {
      const idx = SEATS.indexOf(seat);
      return SEATS[(idx + 1) % 4];
    };
    session.nextChaodiSeat = getNextSeat(state.trumpState.kittyHolder || state.dealer);
    session.chaodiRound = 1;
    session.chaodiPassCount = 0;
  }

  return { nextPhase, currentLeader: state.dealer };
}
