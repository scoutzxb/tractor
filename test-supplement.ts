#!/usr/bin/env bun

import { GameEngine, createGameEngine } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { smartDiscardKitty } from './src/ai/smart-discard';

const LEVEL: Rank = '2';

class TestAI {
  seat: Seat;
  name: string;
  
  constructor(seat: Seat, name: string) {
    this.seat = seat;
    this.name = name;
  }
  
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    
    if (state.isGrabMode && state.currentTrump) {
      if (state.currentTrump.declarer === this.seat) {
        const currentSuit = state.currentTrump.suit;
        const sameSuitCards = levelCards.filter(c => c.suit === currentSuit);
        
        console.log(`  ${this.seat} 检查补亮: 当前${state.currentTrump.cards.length}张，手上有${sameSuitCards.length}张${currentSuit}级牌`);
        
        if (sameSuitCards.length > state.currentTrump.cards.length) {
          console.log(`  ${this.seat} 决定补亮: ${sameSuitCards.length}张`);
          return sameSuitCards.slice(0, sameSuitCards.length);
        }
      }
      return null;
    }
    
    if (levelCards.length >= 1) {
      return levelCards.slice(0, 1);
    }
    
    return null;
  }
  
  chooseChaoDi(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    return null;
  }
  
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[] {
    return smartDiscardKitty(hand, ctx, 6);
  }
  
  playCards(hand: Card[], leadCards: Card[] | null, ctx: GameContext): Card[] {
    return [hand[0]];
  }
}

function testSupplement() {
  console.log('\n🎴 补亮机制测试\n');
  
  const engine = createGameEngine(LEVEL, 'east', true);
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  
  for (const seat of seats) {
    engine.registerPlayer(new TestAI(seat, seat));
  }
  
  const deck = engine.prepareDeck();
  
  for (let round = 1; round <= 39; round++) {
    const roundCards = engine.dealOneRound(deck, round);
    
    // 只在亮主者抓牌时显示
    const trump = engine.getState().trumpState.currentTrump;
    if (trump) {
      const declarer = trump.declarer;
      const card = roundCards.get(declarer);
      if (card) {
        console.log(`第 ${round} 轮: ${declarer} 抓到 ${card.suit}${card.rank}`);
      }
    }
    
    for (const seat of seats) {
      const player = engine.getPlayer(seat);
      if (!player) continue;
      
      const hand = engine.getState().hands.get(seat) || [];
      const cards = player.chooseTrump(hand, LEVEL, engine.getState().trumpState);
      
      if (cards && cards.length > 0) {
        const success = engine.tryDeclare(seat, cards);
        if (success) {
          const newTrump = engine.getState().trumpState.currentTrump;
          console.log(`  ✅ ${seat} 亮主成功 (${cards.length}张${cards[0].suit}级牌)`);
        }
      }
    }
  }
  
  const trump = engine.getState().trumpState.currentTrump;
  
  console.log('\n📦 最终结果\n');
  if (trump) {
    console.log(`亮主者: ${trump.declarer}`);
    console.log(`主花色: ${trump.suit}`);
    console.log(`亮主牌数: ${trump.cards.length}张`);
  }
  
  console.log('\n✅ 测试完成\n');
}

testSupplement();
