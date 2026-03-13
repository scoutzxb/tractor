import type { Card, GameContext, Seat, Rank, TrumpState } from '../core/types';
import type { Player } from '../engine/game-loop';
import { chooseTrump } from './trump-strategy';
import { chooseChaoDi } from './chaodi-strategy';
import { chooseKittyDiscards, chooseKittyDiscardsWithDealerInfo } from './discard-strategy';

export class SimpleAI implements Player {
  seat: Seat;
  name: string;

  constructor(seat: Seat, name: string) {
    this.seat = seat;
    this.name = name;
  }

  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    return chooseTrump(hand, level, state, this.seat);
  }

  chooseChaoDi(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    return chooseChaoDi(hand, level, state, this.seat);
  }

  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext, seat?: Seat, dealer?: Seat): Card[] {
    // 如果提供了seat和dealer，使用带庄家信息的策略
    if (seat && dealer) {
      const toDiscard = chooseKittyDiscardsWithDealerInfo(hand, ctx, 6, seat, dealer);
      return hand.filter(c => !toDiscard.includes(c));
    }
    // 否则使用原有策略
    const toDiscard = chooseKittyDiscards(hand, ctx, 6);
    return hand.filter(c => !toDiscard.includes(c));
  }

  playCards(hand: Card[], leadCards: Card[] | null, ctx: GameContext, gameState: any): Card[] {
    if (!leadCards) return [hand[0]];
    return [hand[0]];
  }
}
