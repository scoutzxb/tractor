#!/usr/bin/env bun

// 测试翻底牌决定主花色 - 无人亮主的情况

import { GameEngine, createGameEngine, type Player } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { smartDiscardKitty } from './src/ai/smart-discard';
import { sortHand, SUIT_NAMES } from './src/core/deck';

const LEVEL: Rank = '2';
const DEALER: Seat = 'east';

// 不亮主的AI：永远不会亮主
class NoDeclareAI implements Player {
  seat: Seat;
  name: string;
  
  constructor(seat: Seat, name: string) {
    this.seat = seat;
    this.name = name;
  }
  
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    // 永远不亮主
    return null;
  }
  
  chooseChaoDi(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    // 永远不炒底
    return null;
  }
  
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[] {
    // 使用智能扣底牌策略 - 返回要保留的39张牌
    const toDiscard = smartDiscardKitty(hand, ctx, 6);
    const toKeep = hand.filter(c => !toDiscard.includes(c));
    return toKeep;
  }
  
  playCards(
    hand: Card[],
    leadCards: Card[] | null,
    ctx: GameContext,
    gameState: any
  ): Card[] {
    if (!leadCards) {
      return [hand[0]];
    } else {
      return [hand[0]];
    }
  }
}

// 格式化单张牌
function formatCard(card: Card | string): string {
  if (typeof card === 'string') return card;
  if (card.joker) {
    return card.joker === 'big' ? '大王' : '小王';
  }
  return `${SUIT_NAMES[card.suit!]}${card.rank}`;
}

// 格式化一组牌
function formatCards(cards: (Card | string)[]): string {
  return cards.map(formatCard).join(' ');
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
    // 按主花色级牌、其他花色级牌排序
    const ordered = [];
    const level = ctx.level;
    
    // 王牌
    const jokers = trumpCards.filter(c => c.joker);
    jokers.sort((a, b) => {
      if (a.joker === 'big' && b.joker === 'small') return -1;
      if (a.joker === 'small' && b.joker === 'big') return 1;
      return 0;
    });
    ordered.push(...jokers);
    
    // 主花色级牌
    if (ctx.trumpSuit) {
      const trumpLevelCards = trumpCards.filter(c => !c.joker && c.rank === level && c.suit === ctx.trumpSuit);
      ordered.push(...trumpLevelCards);
    }
    
    // 其他花色级牌（按花色优先级：♠ > ♥ > ♣ > ♦）
    const suitPriority: Record<string, number> = { 'spade': 0, 'heart': 1, 'club': 2, 'diamond': 3 };
    const otherLevelCards = trumpCards.filter(c => !c.joker && c.rank === level && (!ctx.trumpSuit || c.suit !== ctx.trumpSuit));
    otherLevelCards.sort((a, b) => suitPriority[a.suit!] - suitPriority[b.suit!]);
    ordered.push(...otherLevelCards);
    
    // 主花色其他牌
    if (ctx.trumpSuit) {
      const trumpSuitCards = trumpCards.filter(c => !c.joker && c.rank !== level && c.suit === ctx.trumpSuit);
      trumpSuitCards.sort((a, b) => {
        const rankValues: Record<string, number> = {
          '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
          'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return rankValues[b.rank!] - rankValues[a.rank!];
      });
      ordered.push(...trumpSuitCards);
    }
    
    const display = ordered.map(formatCard).join(' ');
    parts.push(`【主牌】${display}`);
  }
  
  // 各花色副牌
  const suits: ('spade' | 'heart' | 'club' | 'diamond')[] = ['spade', 'heart', 'club', 'diamond'];
  for (const suit of suits) {
    if (suit === ctx.trumpSuit) continue;
    
    const suitCards = sorted.filter(c => c.suit === suit && c.rank !== ctx.level);
    if (suitCards.length > 0) {
      const display = suitCards.map(formatCard).join(' ');
      parts.push(`【${SUIT_NAMES[suit]}】${display}`);
    }
  }
  
  return parts.join('\n  ');
}

function testFlipKitty() {
  console.log('\n🎴 翻底牌测试 - 无人亮主的情况\n');
  console.log('='.repeat(80));
  
  // 使用固定种子以便重现
  const seed = Math.floor(Math.random() * 1000000);
  console.log(`\n种子: ${seed} (用于重现这局游戏)\n`);
  
  const engine = createGameEngine(LEVEL, DEALER, false);
  
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  const names = ['东', '北', '西', '南'];
  
  for (let i = 0; i < seats.length; i++) {
    const player = new NoDeclareAI(seats[i], names[i]);
    engine.registerPlayer(player);
  }
  
  console.log('策略: 所有玩家都不亮主，测试翻底牌决定主花色\n');
  
  // 发牌
  engine.dealCards();
  
  // 保存原始底牌
  const originalKitty = [...engine.getState().kitty];
  
  console.log('📦 阶段1: 发牌完成\n');
  
  // 亮主阶段
  engine.trumpPhase();
  
  const state = engine.getState();
  const trump = state.trumpState.currentTrump;
  
  if (!trump) {
    console.log('❌ 错误：无人亮主但也没有翻底牌！');
    return;
  }
  
  // 显示翻底牌结果
  console.log('\n📦 阶段2: 亮主阶段\n');
  console.log('无人亮主，翻底牌决定主花色\n');
  
  console.log(`原始底牌 (6张):\n  ${formatCards(originalKitty)}\n`);
  
  // 检查翻底牌的逻辑
  const jokers = originalKitty.filter(c => c.joker);
  const levelCards = originalKitty.filter(c => c.rank === LEVEL);
  
  if (jokers.length > 0) {
    console.log(`底牌中有王: ${formatCards(jokers)}`);
    console.log(`✅ 无主（底牌中有王）\n`);
  } else if (levelCards.length > 0) {
    console.log(`底牌中的级牌: ${formatCards(levelCards)}`);
    console.log(`第一张级牌: ${formatCard(levelCards[0])} (${SUIT_NAMES[levelCards[0].suit!]})`);
    console.log(`✅ 主花色: ${SUIT_NAMES[levelCards[0].suit!]} (由第一张级牌决定)\n`);
  } else {
    const firstCard = originalKitty[0];
    console.log(`底牌中没有级牌，使用第一张牌: ${formatCard(firstCard)} (${SUIT_NAMES[firstCard.suit!]})`);
    console.log(`✅ 主花色: ${SUIT_NAMES[firstCard.suit!]} (由第一张牌决定)\n`);
  }
  
  // 显示翻底牌后的底牌
  console.log(`翻底牌后的底牌:\n  ${formatCards(state.kitty)}\n`);
  
  // 显示哪张牌决定了主花色
  if (trump.suit) {
    const decidingCard = originalKitty.find(c => c.suit === trump.suit && c.rank === LEVEL);
    if (decidingCard) {
      console.log(`✅ 决定主花色的牌: ${formatCard(decidingCard)} (第一张级牌)\n`);
    } else {
      // 如果没有级牌，应该是第一张牌的花色
      const firstCard = originalKitty[0];
      console.log(`✅ 决定主花色的牌: ${formatCard(firstCard)} (底牌第一张)\n`);
    }
  } else {
    console.log(`✅ 无主（底牌中有大王或小王）\n`);
  }
  
  console.log(`✅ 翻底牌结果:`);
  console.log(`   主花色: ${trump.suit ? SUIT_NAMES[trump.suit] : '无主'}`);
  console.log(`   决定方式: 翻底牌\n`);
  
  // 显示所有玩家的手牌
  console.log('所有玩家的手牌:\n');
  
  for (const seat of seats) {
    const hand = state.hands.get(seat) || [];
    const isDealer = seat === state.dealer;
    
    console.log(`${seat} (${hand.length}张)${isDealer ? ' 【庄家】' : ''}:`);
    console.log(`  ${displayHand(hand, state.ctx!)}`);
    console.log();
  }
  
  console.log('✅ 测试完成\n');
}

testFlipKitty();
