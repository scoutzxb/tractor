#!/usr/bin/env bun

// 测试反主逻辑

import { createGameEngine, type Player } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { canDeclare } from './src/core/trump-state';

class TestAI implements Player {
  seat: Seat;
  name: string;
  
  constructor(seat: Seat, name: string) {
    this.seat = seat;
    this.name = name;
  }
  
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    // 测试：单张亮主
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    if (levelCards.length >= 1 && !state.currentTrump) {
      return levelCards.slice(0, 1);
    }
    
    // 测试：一对大王反主
    const bigJokers = hand.filter(c => c.joker === 'big');
    if (bigJokers.length >= 2 && state.currentTrump) {
      if (canDeclare(state, this.seat, bigJokers.slice(0, 2), level)) {
        console.log(`  ${this.seat} 尝试用一对大王反主`);
        return bigJokers.slice(0, 2);
      }
    }
    
    return null;
  }
  
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[] {
    return hand.slice(0, 39);
  }
  
  playCards(hand: Card[], leadCards: Card[] | null, ctx: GameContext, gameState: any): Card[] {
    return [hand[0]];
  }
}

const engine = createGameEngine('2', 'east', true);

const seats: Seat[] = ['east', 'north', 'west', 'south'];
for (const seat of seats) {
  engine.registerPlayer(new TestAI(seat, seat));
}

const deck = engine.prepareDeck();

// 模拟抓牌过程
for (let round = 1; round <= 39; round++) {
  const roundCards = engine.dealOneRound(deck, round);
  
  for (const seat of seats) {
    const player = engine.getPlayer(seat);
    if (!player) continue;
    
    const hand = engine.getState().hands.get(seat) || [];
    const trumpCards = player.chooseTrump(hand, '2', engine.getState().trumpState);
    
    if (trumpCards && trumpCards.length > 0) {
      const success = engine.tryDeclare(seat, trumpCards);
      if (success) {
        console.log(`第 ${round} 轮: ${seat} 亮主: ${trumpCards.map(c => c.joker || `${c.suit}${c.rank}`).join(' ')}`);
      }
    }
  }
}

const state = engine.getState();
console.log(`\n最终亮主者: ${state.trumpState.currentTrump?.declarer}`);
console.log(`主花色: ${state.trumpState.currentTrump?.suit || '无主'}`);
