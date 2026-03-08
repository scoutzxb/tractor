#!/usr/bin/env bun

// 测试亮主和炒底 - 使用真实游戏引擎

import { GameEngine, createGameEngine, type Player } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { canChaoDi } from './src/core/trump-state';
import { smartDiscardKitty } from './src/ai/smart-discard';
import { sortHand, SUIT_NAMES } from './src/core/deck';

const LEVEL: Rank = '2';
const DEALER: Seat = 'east';

// 格式化单张牌为中文显示
function formatCard(card: Card | string): string {
  if (typeof card === 'string') {
    // 如果已经是字符串格式（从日志来的），转换为中文
    // 格式可能是 "diamond6" 或 "spade2" 等
    const match = card.match(/(spade|heart|club|diamond|big|small)(\w*)/);
    if (match) {
      const [, suitOrJoker, rank] = match;
      if (suitOrJoker === 'big') return '大王';
      if (suitOrJoker === 'small') return '小王';
      const suitMap: Record<string, string> = {
        'spade': '♠',
        'heart': '♥',
        'club': '♣',
        'diamond': '♦'
      };
      return `${suitMap[suitOrJoker] || suitOrJoker}${rank}`;
    }
    return card;
  }
  
  // Card对象
  if (card.joker) {
    return card.joker === 'big' ? '大王' : '小王';
  }
  return `${SUIT_NAMES[card.suit!]}${card.rank}`;
}

// 格式化一组牌
function formatCards(cards: (Card | string)[]): string {
  return cards.map(formatCard).join(' ');
}

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
  
  // 炒底时选择最强牌型 - 使用引擎的canChaoDi函数
  private chooseChaoDiCards(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    // 统计各种牌型
    const jokers = hand.filter(c => c.joker);
    const bigJokers = jokers.filter(c => c.joker === 'big');
    const smallJokers = jokers.filter(c => c.joker === 'small');
    
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    const levelBySuit = new Map<string, Card[]>();
    for (const card of levelCards) {
      const suit = card.suit!;
      if (!levelBySuit.has(suit)) {
        levelBySuit.set(suit, []);
      }
      levelBySuit.get(suit)!.push(card);
    }
    
    // 按优先级从高到低（数字从小到大）尝试所有组合
    const candidates: Card[][] = [];
    
    // 优先级1: 三个大王
    if (bigJokers.length >= 3) {
      candidates.push(bigJokers.slice(0, 3));
    }
    
    // 优先级2: 三个小王
    if (smallJokers.length >= 3) {
      candidates.push(smallJokers.slice(0, 3));
    }
    
    // 优先级3: 三张同花色级牌
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 3) {
        candidates.push(cards.slice(0, 3));
      }
    }
    
    // 优先级4: 一对大王
    if (bigJokers.length >= 2) {
      candidates.push(bigJokers.slice(0, 2));
    }
    
    // 优先级5: 一对小王
    if (smallJokers.length >= 2) {
      candidates.push(smallJokers.slice(0, 2));
    }
    
    // 优先级6: 一对同花色级牌（按花色优先级排序：spade > heart > club > diamond）
    const suitPriority = ['spade', 'heart', 'club', 'diamond'];
    for (const suit of suitPriority) {
      const cards = levelBySuit.get(suit);
      if (cards && cards.length >= 2) {
        candidates.push(cards.slice(0, 2));
      }
    }
    
    // 尝试每个组合，返回第一个通过canChaoDi的
    for (const combo of candidates) {
      if (canChaoDi(state, this.seat, combo, level)) {
        return combo;
      }
    }
    
    return null;
  }
  
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[] {
    // 使用智能扣底牌策略 - 返回6张要扣回的牌
    const toDiscard = smartDiscardKitty(hand, ctx, 6);
    
    // 引擎期望返回39张要保留的牌
    // 所以需要从hand中过滤掉toDiscard
    const discardIds = new Set(toDiscard.map(c => c.id));
    const toKeep = hand.filter(c => !discardIds.has(c.id));
    
    return toKeep;
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
  
  // 庄家扣底牌阶段
  const initialKitty = [...state.kitty];
  
  console.log(`\n📦 阶段2: 庄家获得底牌\n`);
  console.log(`${state.dealer} 获得底牌: ${formatCards(initialKitty)}\n`);
  
  engine.discardPhase();
  
  state = engine.getState();
  
  console.log(`📦 阶段3: 庄家扣底牌\n`);
  console.log(`${state.dealer} 扣底牌: ${formatCards(state.kitty)}\n`);
  
  // 炒底阶段
  engine.chaoDiPhase();
  
  const chaoDiLogs = engine.getLogs().filter(l => l.type === 'chaoDi');
  
  if (chaoDiLogs.length > 0) {
    console.log(`\n📦 炒底阶段\n`);
    console.log(`规则: 炒底成功者获得底牌，需要扣回6张牌\n`);
    
    for (let i = 0; i < chaoDiLogs.length; i++) {
      console.log(`--- 炒底第 ${i + 1} 轮 ---\n`);
      const log = chaoDiLogs[i];
      console.log(`🔥 ${log.details?.newTrump?.declarer} 炒底成功: ${formatCards(log.details?.cards || [])}`);
      console.log(`   新主花色: ${log.details?.newTrump?.suit ? SUIT_NAMES[log.details.newTrump.suit] : '无主'}`);
      if (log.details?.receivedKitty) {
        console.log(`   ${log.details.newTrump?.declarer} 获得底牌: ${formatCards(log.details.receivedKitty)}`);
      }
      if (log.details?.discardedKitty) {
        console.log(`   ${log.details.newTrump?.declarer} 扣回的牌: ${formatCards(log.details.discardedKitty)}`);
      }
      console.log();
    }
  } else {
    console.log(`\n📦 炒底阶段\n`);
    console.log('无人能炒底\n');
  }
  
  state = engine.getState();
  trump = state.trumpState.currentTrump;
  
  console.log('\n📦 最终结果\n');
  console.log(`主花色: ${state.ctx?.trumpSuit ? SUIT_NAMES[state.ctx.trumpSuit] : '无主'}`);
  console.log(`庄家: ${state.dealer.toUpperCase()}\n`);
  
  // 显示最终的底牌
  console.log('底牌 (炒底后):');
  console.log(`  ${formatCards(state.kitty)}`);
  console.log();
  
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
