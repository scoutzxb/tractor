#!/usr/bin/env bun

// 强制测试反主逻辑

import { createGameEngine, type Player } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';

class TestAI implements Player {
  seat: Seat;
  name: string;
  strategy: 'single' | 'pair' | 'triple';
  
  constructor(seat: Seat, name: string, strategy: 'single' | 'pair' | 'triple') {
    this.seat = seat;
    this.name = name;
    this.strategy = strategy;
  }
  
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    const jokers = hand.filter(c => c.joker);
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    
    // 按策略选择
    if (this.strategy === 'triple') {
      // 优先三张
      const bigJokers = jokers.filter(c => c.joker === 'big');
      if (bigJokers.length >= 3) return bigJokers.slice(0, 3);
      
      const smallJokers = jokers.filter(c => c.joker === 'small');
      if (smallJokers.length >= 3) return smallJokers.slice(0, 3);
    }
    
    if (this.strategy === 'pair') {
      // 优先一对
      const bigJokers = jokers.filter(c => c.joker === 'big');
      if (bigJokers.length >= 2) return bigJokers.slice(0, 2);
      
      const smallJokers = jokers.filter(c => c.joker === 'small');
      if (smallJokers.length >= 2) return smallJokers.slice(0, 2);
      
      // 尝试一对级牌
      const levelBySuit = new Map<string, Card[]>();
      for (const card of levelCards) {
        const suit = card.suit!;
        if (!levelBySuit.has(suit)) levelBySuit.set(suit, []);
        levelBySuit.get(suit)!.push(card);
      }
      
      for (const [suit, cards] of levelBySuit) {
        if (cards.length >= 2) return cards.slice(0, 2);
      }
    }
    
    // 默认：单张
    if (levelCards.length >= 1) return levelCards.slice(0, 1);
    
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

// 设置不同策略
engine.registerPlayer(new TestAI('east', '东', 'single'));
engine.registerPlayer(new TestAI('north', '北', 'pair'));
engine.registerPlayer(new TestAI('west', '西', 'pair'));
engine.registerPlayer(new TestAI('south', '南', 'triple'));

const deck = engine.prepareDeck();

console.log('开始测试反主逻辑...\n');

// 模拟抓牌过程
for (let round = 1; round <= 39; round++) {
  const roundCards = engine.dealOneRound(deck, round);
  
  for (const seat of ['east', 'north', 'west', 'south'] as Seat[]) {
    const player = engine.getPlayer(seat);
    if (!player) continue;
    
    const hand = engine.getState().hands.get(seat) || [];
    const trumpCards = player.chooseTrump(hand, '2', engine.getState().trumpState);
    
    if (trumpCards && trumpCards.length > 0) {
      const success = engine.tryDeclare(seat, trumpCards);
      if (success) {
        const trump = trumpCards.map(c => c.joker || `${c.suit}${c.rank}`).join(' ');
        console.log(`第 ${round} 轮: ${seat} 亮主: ${trump}`);
      }
    }
  }
}

const state = engine.getState();
console.log(`\n最终亮主者: ${state.trumpState.currentTrump?.declarer}`);
console.log(`主花色: ${state.trumpState.currentTrump?.suit || '无主'}`);
console.log(`亮主历史: ${state.trumpState.declarations.length} 次`);
