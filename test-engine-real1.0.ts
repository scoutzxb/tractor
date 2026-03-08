#!/usr/bin/env bun

// 测试亮主和炒底 - 使用真实游戏引擎

import { GameEngine, createGameEngine, type Player } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { smartDiscardKitty } from './src/ai/smart-discard';
import { sortHand, SUIT_NAMES } from './src/core/deck';

const LEVEL: Rank = '2';
const DEALER: Seat = 'east';

// 简单AI：只用单张级牌亮主，保留更强的牌型用于炒底
class SimpleAI implements Player {
  seat: Seat;
  name: string;
  
  constructor(seat: Seat, name: string) {
    this.seat = seat;
    this.name = name;
  }
  
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    // 如果已经有人亮主，这是炒底阶段，返回最强牌型
    if (state.currentTrump) {
      return this.chooseChaoDiCards(hand, level, state);
    }
    
    // 初始亮主：只用单张级牌
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    if (levelCards.length >= 1) {
      return levelCards.slice(0, 1);
    }
    
    return null;
  }
  
  // 炒底时选择最强牌型
  private chooseChaoDiCards(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    const currentPriority = state.currentTrump?.priority || 0;
    
    // 统计各种牌型
    const jokers = hand.filter(c => c.joker);
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    
    // 按优先级从高到低检查
    // 三个大王
    const bigJokers = jokers.filter(c => c.joker === 'big');
    if (bigJokers.length >= 3 && 10 < currentPriority) {
      return bigJokers.slice(0, 3);
    }
    
    // 三个小王
    const smallJokers = jokers.filter(c => c.joker === 'small');
    if (smallJokers.length >= 3 && 9 < currentPriority) {
      return smallJokers.slice(0, 3);
    }
    
    // 三张同花色级牌
    const levelBySuit = new Map<string, Card[]>();
    for (const card of levelCards) {
      const suit = card.suit!;
      if (!levelBySuit.has(suit)) {
        levelBySuit.set(suit, []);
      }
      levelBySuit.get(suit)!.push(card);
    }
    
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 3 && 8 < currentPriority) {
        return cards.slice(0, 3);
      }
    }
    
    // 一对大王
    if (bigJokers.length >= 2 && 7 < currentPriority) {
      return bigJokers.slice(0, 2);
    }
    
    // 一对小王
    if (smallJokers.length >= 2 && 6 < currentPriority) {
      return smallJokers.slice(0, 2);
    }
    
    // 一对同花色级牌
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 2 && 5 < currentPriority) {
        return cards.slice(0, 2);
      }
    }
    
    return null;
  }
  
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[] {
    // 使用智能扣底牌策略
    return smartDiscardKitty(hand, ctx, 6);
  }
  
  playCards(
    hand: Card[],
    leadCards: Card[] | null,
    ctx: GameContext,
    gameState: any
  ): Card[] {
    // 简单出牌策略
    if (!leadCards) {
      return [hand[0]];
    } else {
      return [hand[0]];
    }
  }
}

// 显示手牌
function displayHand(hand: Card[], ctx: GameContext): string {
  const sorted = sortHand([...hand], ctx);
  
  const parts: string[] = [];
  
  // 主牌
  const trumpCards = sorted.filter(c => {
    if (c.joker) return true;
    if (c.rank === ctx.level) return true;
    if (ctx.trumpSuit && c.suit === ctx.trumpSuit) return true;
    return false;
  });
  
  if (trumpCards.length > 0) {
    const display = trumpCards.map(c => {
      if (c.joker) return c.joker === 'big' ? '大王' : '小王';
      return `${SUIT_NAMES[c.suit!]}${c.rank}`;
    }).join(' ');
    parts.push(`【主牌】${display}`);
  }
  
  // 各花色副牌
  const suits: ('spade' | 'heart' | 'club' | 'diamond')[] = ['spade', 'heart', 'club', 'diamond'];
  for (const suit of suits) {
    if (suit === ctx.trumpSuit) continue;
    
    const suitCards = sorted.filter(c => c.suit === suit && c.rank !== ctx.level);
    if (suitCards.length > 0) {
      const display = suitCards.map(c => `${SUIT_NAMES[c.suit!]}${c.rank}`).join(' ');
      parts.push(`【${SUIT_NAMES[suit]}】${display}`);
    }
  }
  
  return parts.join('\n  ');
}

// 测试亮主和炒底
function testTrumpAndChaoDi() {
  console.log('\n🎴 完整的亮主炒底测试 - 使用真实游戏引擎\n');
  console.log('='.repeat(80));
  
  const engine = createGameEngine(LEVEL, DEALER);
  
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  const names = ['东', '北', '西', '南'];
  
  for (let i = 0; i < seats.length; i++) {
    const player = new SimpleAI(seats[i], names[i]);
    engine.registerPlayer(player);
  }
  
  engine.dealCards();
  
  console.log('\n📦 阶段1: 发牌完成\n');
  console.log('策略: 玩家只用单张级牌亮主，保留一对、三张等更强牌型用于炒底\n');
  
  engine.trumpPhase();
  
  let state = engine.getState();
  let trump = state.trumpState.currentTrump;
  
  if (trump) {
    console.log(`\n✅ 初始亮主完成: ${trump.declarer} 亮主`);
    console.log(`   主花色: ${trump.suit ? SUIT_NAMES[trump.suit] : '无主'}`);
    console.log(`   庄家: ${state.dealer.toUpperCase()}\n`);
  } else {
    console.log('\n无人亮主，翻底牌决定主花色\n');
  }
  
  engine.chaoDiPhase();
  
  const logs = engine.getLogs();
  const chaoDiLogs = logs.filter(l => l.type === 'chaoDi');
  
  if (chaoDiLogs.length > 0) {
    console.log('\n📦 炒底过程:\n');
    for (const log of chaoDiLogs) {
      console.log(`🔥 ${log.message}`);
      if (log.details?.cards) {
        console.log(`   用了: ${log.details.cards.join(' ')}`);
      }
      if (log.details?.newTrump) {
        console.log(`   新主花色: ${log.details.newTrump.suit ? SUIT_NAMES[log.details.newTrump.suit] : '无主'}`);
        console.log(`   炒底者: ${log.details.newTrump.declarer}`);
      }
      if (log.details?.kitty) {
        console.log(`   扣回的底牌: ${log.details.kitty.join(' ')}`);
      }
      console.log();
    }
  } else {
    console.log('\n无人炒底\n');
  }
  
  state = engine.getState();
  trump = state.trumpState.currentTrump;
  
  console.log('\n📦 最终结果\n');
  console.log(`主花色: ${state.ctx?.trumpSuit ? SUIT_NAMES[state.ctx.trumpSuit] : '无主'}`);
  console.log(`庄家: ${state.dealer.toUpperCase()}\n`);
  
  console.log('所有玩家的最终手牌:\n');
  
  for (const seat of seats) {
    const hand = state.hands.get(seat) || [];
    const isDealer = seat === state.dealer;
    
    console.log(`${seat} (${hand.length}张)${isDealer ? ' 【庄家】' : ''}:`);
    console.log(`  ${displayHand(hand, state.ctx!)}`);
    console.log();
  }
  
  console.log('✅ 测试完成\n');
}

testTrumpAndChaoDi();
