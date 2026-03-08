#!/usr/bin/env bun

// 测试不同游戏模式 - 抢庄局和非抢庄局

import { GameEngine, createGameEngine, type Player } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { canChaoDi, canDeclare } from './src/core/trump-state';
import { smartDiscardKitty } from './src/ai/smart-discard';
import { sortHand, SUIT_NAMES } from './src/core/deck';

// 解析命令行参数
function parseArgs(): { mode: 'grab' | 'normal'; level: Rank; dealer: Seat; seed?: number } {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法:');
    console.log('  抢庄局: bun test-game-modes.ts grab [seed]');
    console.log('  非抢庄局: bun test-game-modes.ts <level> <dealer> [seed]');
    console.log('  例如: bun test-game-modes.ts 5 north 12345');
    process.exit(1);
  }
  
  let seed: number | undefined;
  let mode: 'grab' | 'normal';
  let level: Rank = '2';
  let dealer: Seat = 'east';
  
  if (args[0] === 'grab') {
    mode = 'grab';
    if (args.length >= 2) {
      seed = parseInt(args[1]);
      if (isNaN(seed)) {
        console.error('错误: 种子必须是数字');
        process.exit(1);
      }
    }
  } else {
    if (args.length < 2) {
      console.error('错误: 参数不足');
      process.exit(1);
    }
    
    level = args[0] as Rank;
    dealer = args[1] as Seat;
    
    if (args.length >= 3) {
      seed = parseInt(args[2]);
      if (isNaN(seed)) {
        console.error('错误: 种子必须是数字');
        process.exit(1);
      }
    }
    
    const validLevels = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    if (!validLevels.includes(level)) {
      console.error(`错误: 级别必须是 ${validLevels.join(', ')}`);
      process.exit(1);
    }
    
    const validSeats = ['east', 'north', 'west', 'south'];
    if (!validSeats.includes(dealer)) {
      console.error(`错误: 庄家必须是 ${validSeats.join(', ')}`);
      process.exit(1);
    }
    
    mode = 'normal';
  }
  
  return { mode, level, dealer, seed };
}

// 格式化单张牌
function formatCard(card: Card | string): string {
  if (typeof card === 'string') return card;
  if (card.joker) return card.joker === 'big' ? '大王' : '小王';
  return `${SUIT_NAMES[card.suit!]}${card.rank}`;
}

// 格式化一组牌
function formatCards(cards: (Card | string)[]): string {
  return cards.map(card => {
    if (typeof card === 'string') {
      // 处理字符串格式，如 "club8" -> "♣8"
      const suitMap: Record<string, string> = {
        'spade': '♠', 'heart': '♥', 'club': '♣', 'diamond': '♦',
        'big': '大王', 'small': '小王'
      };
      for (const [eng, symbol] of Object.entries(suitMap)) {
        if (card.includes(eng)) {
          if (eng === 'big' || eng === 'small') return symbol;
          return symbol + card.replace(eng, '');
        }
      }
      return card;
    }
    return formatCard(card);
  }).join(' ');
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
    // 按优先级排序：大王 > 小王 > 级牌(按花色) > 主花色牌
    const bigJokers = trumpCards.filter(c => c.joker === 'big');
    const smallJokers = trumpCards.filter(c => c.joker === 'small');
    const levelCards = trumpCards.filter(c => c.rank === ctx.level && !c.joker);
    const trumpSuitCards = trumpCards.filter(c => c.suit === ctx.trumpSuit && c.rank !== ctx.level);
    
    // 级牌排序：主花色级牌在前，其他按花色优先级排序
    const suitOrder = ['spade', 'heart', 'club', 'diamond'];
    levelCards.sort((a, b) => {
      // 主花色级牌排在最前面
      if (a.suit === ctx.trumpSuit && b.suit !== ctx.trumpSuit) return -1;
      if (b.suit === ctx.trumpSuit && a.suit !== ctx.trumpSuit) return 1;
      // 其他级牌按花色优先级排序
      return suitOrder.indexOf(a.suit!) - suitOrder.indexOf(b.suit!);
    });
    
    const ordered = [...bigJokers, ...smallJokers, ...levelCards, ...trumpSuitCards];
    const display = ordered.map(c => {
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

// 简单AI：只用单张级牌亮主，保留更强的牌型用于炒底
class SimpleAI implements Player {
  seat: Seat;
  name: string;
  
  constructor(seat: Seat, name: string) {
    this.seat = seat;
    this.name = name;
  }
  
  // 亮主阶段（包括反主）- 只在抓牌阶段调用
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    console.log(`  ${this.seat} chooseTrump called: phase=${state.phase}, currentTrump=${state.currentTrump?.declarer}, kittyHolder=${state.kittyHolder}`);
    
    // 如果有人亮主
    if (state.currentTrump) {
      // 非抢庄局：不反主
      if (!state.isGrabMode) {
        console.log(`  ${this.seat} 非抢庄局，不反主`);
        return null;
      }
      // 抢庄局：尝试反主
      console.log(`  ${this.seat} 抢庄局，尝试反主... (当前优先级: ${state.currentTrump.priority})`);
      return this.tryCounterDeclare(hand, level, state);
    }
    
    // 初始亮主：只用单张级牌
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    if (levelCards.length >= 1) {
      return levelCards.slice(0, 1);
    }
    
    return null;
  }
  
  // 抓牌阶段的反主 - 使用canDeclare
  private chooseDealTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    console.log(`  ${this.seat} chooseDealTrump: isGrabMode=${state.isGrabMode}, currentTrump=${state.currentTrump?.declarer}`);
    
    // 非抢庄局且有人亮主，不反主
    if (state.currentTrump && !state.isGrabMode) {
      console.log(`  ${this.seat} 非抢庄局，不反主`);
      return null;
    }
    
    // 抢庄局：尝试反主
    if (state.currentTrump && state.isGrabMode) {
      console.log(`  ${this.seat} 尝试反主... (当前优先级: ${state.currentTrump.priority})`);
      return this.tryCounterDeclare(hand, level, state);
    }
    
    // 初始亮主：只用单张级牌
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    if (levelCards.length >= 1) {
      return levelCards.slice(0, 1);
    }
    
    return null;
  }
  
  // 尝试反主（抢庄局）
  private tryCounterDeclare(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    const jokers = hand.filter(c => c.joker);
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    
    console.log(`    ${this.seat} has ${jokers.length} jokers: ${jokers.map(j => j.joker).join(', ')}`);
    console.log(`    ${this.seat} has ${levelCards.length} level cards`);
    
    // 按优先级从高到低尝试
    // 三个大王
    const bigJokers = jokers.filter(c => c.joker === 'big');
    if (bigJokers.length >= 3) {
      const cards = bigJokers.slice(0, 3);
      if (canDeclare(state, this.seat, cards, level, state.isGrabMode ? this.seat : undefined)) {
        console.log(`  ${this.seat} 可以用三个大王反主`);
        return cards;
      }
    }
    
    // 三个小王
    const smallJokers = jokers.filter(c => c.joker === 'small');
    if (smallJokers.length >= 3) {
      const cards = smallJokers.slice(0, 3);
      if (canDeclare(state, this.seat, cards, level, state.isGrabMode ? this.seat : undefined)) {
        console.log(`  ${this.seat} 可以用三个小王反主`);
        return cards;
      }
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
      if (cards.length >= 3) {
        const candidate = cards.slice(0, 3);
        if (canDeclare(state, this.seat, candidate, level, state.isGrabMode ? this.seat : undefined)) {
          console.log(`  ${this.seat} 可以用三张${SUIT_NAMES[suit]}${level}反主`);
          return candidate;
        }
      }
    }
    
    // 一对大王
    if (bigJokers.length >= 2) {
      const cards = bigJokers.slice(0, 2);
      if (canDeclare(state, this.seat, cards, level, state.isGrabMode ? this.seat : undefined)) {
        console.log(`  ${this.seat} 可以用一对大王反主`);
        return cards;
      }
    }
    
    // 一对小王
    if (smallJokers.length >= 2) {
      const cards = smallJokers.slice(0, 2);
      if (canDeclare(state, this.seat, cards, level, state.isGrabMode ? this.seat : undefined)) {
        console.log(`  ${this.seat} 可以用一对小王反主`);
        return cards;
      }
    }
    
    // 一对同花色级牌
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 2) {
        const candidate = cards.slice(0, 2);
        if (canDeclare(state, this.seat, candidate, level, state.isGrabMode ? this.seat : undefined)) {
          console.log(`  ${this.seat} 可以用一对${SUIT_NAMES[suit]}${level}反主`);
          return candidate;
        }
      }
    }
    
    console.log(`  ${this.seat} 没有足够的牌反主`);
    return null;
  }
  
  // 炒底阶段 - 使用canChaoDi
  chooseChaoDi(hand: Card[], level: Rank, state: TrumpState): Card[] | null {
    const jokers = hand.filter(c => c.joker);
    const levelCards = hand.filter(c => c.rank === level && !c.joker);
    
    // 尝试所有可能的组合，按优先级从高到低
    // 三个大王
    const bigJokers = jokers.filter(c => c.joker === 'big');
    if (bigJokers.length >= 3) {
      const cards = bigJokers.slice(0, 3);
      if (canChaoDi(state, this.seat, cards, level)) return cards;
    }
    
    // 三个小王
    const smallJokers = jokers.filter(c => c.joker === 'small');
    if (smallJokers.length >= 3) {
      const cards = smallJokers.slice(0, 3);
      if (canChaoDi(state, this.seat, cards, level)) return cards;
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
      if (cards.length >= 3) {
        const candidate = cards.slice(0, 3);
        if (canChaoDi(state, this.seat, candidate, level)) return candidate;
      }
    }
    
    // 一对大王
    if (bigJokers.length >= 2) {
      const cards = bigJokers.slice(0, 2);
      if (canChaoDi(state, this.seat, cards, level)) return cards;
    }
    
    // 一对小王
    if (smallJokers.length >= 2) {
      const cards = smallJokers.slice(0, 2);
      if (canChaoDi(state, this.seat, cards, level)) return cards;
    }
    
    // 一对同花色级牌
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 2) {
        const candidate = cards.slice(0, 2);
        if (canChaoDi(state, this.seat, candidate, level)) return candidate;
      }
    }
    
    return null;
  }
  
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[] {
    // 使用智能扣底牌策略 - 返回39张要保留的牌
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
    // 简单出牌策略
    if (!leadCards) {
      return [hand[0]];
    } else {
      return [hand[0]];
    }
  }
}

// 主函数
function main() {
  const { mode, level, dealer, seed } = parseArgs();
  
  // 如果没有提供种子，生成一个随机种子
  const actualSeed = seed || Math.floor(Math.random() * 1000000);
  
  console.log('\n🎴 拖拉机游戏测试\n');
  console.log('='.repeat(80));
  console.log(`模式: ${mode === 'grab' ? '抢庄局' : '非抢庄局'}`);
  console.log(`级别: ${level}`);
  console.log(`庄家: ${dealer.toUpperCase()}`);
  console.log(`种子: ${actualSeed}${seed ? '' : ' (随机生成)'}`);
  
  if (mode === 'grab') {
    console.log('\n⚠️  抢庄局模式：玩家边抓牌边亮主，最后亮主成功者成为庄家\n');
  }
  
  const engine = createGameEngine(level, dealer, mode === 'grab', actualSeed);
  
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  const names = ['东', '北', '西', '南'];
  
  for (let i = 0; i < seats.length; i++) {
    const player = new SimpleAI(seats[i], names[i]);
    engine.registerPlayer(player);
  }
  
  if (mode === 'grab') {
    console.log('\n开始抓牌过程...\n');
    
    // 创建牌组
    const deck = engine.prepareDeck();
    
    // 39轮抓牌
    for (let round = 1; round <= 39; round++) {
      console.log(`--- 第 ${round} 轮抓牌 ---`);
      
      // 抓一轮牌
      const roundCards = engine.dealOneRound(deck, round);
      
      // 显示本轮抓的牌 - 按实际发牌顺序（从庄家开始）
      const dealer = engine.getState().dealer;
      const allSeats: Seat[] = ['east', 'north', 'west', 'south'];
      const dealerIdx = allSeats.indexOf(dealer);
      
      for (let i = 0; i < 4; i++) {
        const seatIdx = (dealerIdx + i) % 4;
        const seat = allSeats[seatIdx];
        const card = roundCards.get(seat);
        if (card) {
          console.log(`  ${seat}: ${formatCard(card)}`);
        }
      }
      
      // 询问每个玩家是否亮主
      for (const seat of seats) {
        const player = engine.getPlayer(seat);
        if (!player) continue;
        
        const hand = engine.getState().hands.get(seat) || [];
        const trumpCards = player.chooseTrump(hand, level, engine.getState().trumpState);
        
        if (trumpCards && trumpCards.length > 0) {
          const success = engine.tryDeclare(seat, trumpCards);
          if (success) {
            console.log(`  📣 ${seat} 亮主: ${formatCards(trumpCards)}`);
          }
        }
      }
      
      console.log();
    }
    
    // 设置底牌
    engine.setKitty(deck);
    console.log('📦 底牌已设置\n');
    
    // 显示底牌
    let state = engine.getState();
    console.log('底牌:');
    console.log(`  ${formatCards(state.kitty)}`);
    console.log();
    
    // 完成亮主阶段
    engine.finalizeTrumpPhase();
    
    // 显示最终结果
    state = engine.getState();
    let trump = state.trumpState.currentTrump;
    
    console.log('🎯 最终亮主结果\n');
    if (trump) {
      console.log(`  ✅ ${trump.declarer} 亮主成功`);
      console.log(`  主花色: ${trump.suit ? SUIT_NAMES[trump.suit] : '无主'}`);
      console.log(`  亮主牌数: ${trump.cards.length}张`);
      console.log(`  庄家: ${state.dealer.toUpperCase()}\n`);
    } else {
      console.log(`  ❌ 无人亮主，翻底牌决定主花色\n`);
    }
    
    // 显示底牌
    console.log('\n📦 底牌:');
    console.log(`  ${formatCards(engine.getState().kitty)}`);
    console.log();
    
    // 抢庄局：庄家扣底牌
    engine.discardPhase();
    console.log('📦 庄家获得底牌并扣回6张牌\n');
    
    // 炒底阶段（抢庄局禁止炒底）
    if (!state.trumpState.isGrabMode) {
      engine.chaoDiPhase();
    }
    
    // 显示底牌
    state = engine.getState();
    console.log('底牌:');
    console.log(`  ${formatCards(state.kitty)}`);
    console.log();
    
    // 显示最终结果
    state = engine.getState();
    trump = state.trumpState.currentTrump;
    
    console.log('\n📦 最终结果\n');
    console.log(`主花色: ${state.ctx?.trumpSuit ? SUIT_NAMES[state.ctx.trumpSuit] : '无主'}`);
  console.log(`庄家: ${state.dealer.toUpperCase()}`);
  
  // 显示亮牌人信息
  if (state.trumpState.currentTrump) {
    const declarer = state.trumpState.currentTrump.declarer;
    const cards = state.trumpState.currentTrump.cards;
    if (declarer && cards) {
      console.log(`亮牌人: ${declarer}`);
      console.log(`亮的牌: ${formatCards(cards)}`);
    }
  }
  console.log();
    
    
    console.log('底牌:');
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
    return;
  }
  
  // 非抢庄局：边抓牌边亮主的流程
  console.log('\n开始抓牌过程...\n');
  
  // 创建牌组
  const deck = engine.prepareDeck();
  
  // 39轮抓牌
  for (let round = 1; round <= 39; round++) {
    console.log(`--- 第 ${round} 轮抓牌 ---`);
    
    // 抓一轮牌
    const roundCards = engine.dealOneRound(deck, round);
    
    // 显示本轮抓的牌 - 按实际发牌顺序（从庄家开始）
    const dealer = engine.getState().dealer;
    const allSeats: Seat[] = ['east', 'north', 'west', 'south'];
    const dealerIdx = allSeats.indexOf(dealer);
    
    for (let i = 0; i < 4; i++) {
      const seatIdx = (dealerIdx + i) % 4;
      const seat = allSeats[seatIdx];
      const card = roundCards.get(seat);
      if (card) {
        console.log(`  ${seat}: ${formatCard(card)}`);
      }
    }
    
    // 询问每个玩家是否亮主
    for (const seat of seats) {
      const player = engine.getPlayer(seat);
      if (!player) continue;
      
      const hand = engine.getState().hands.get(seat) || [];
      const trumpCards = player.chooseTrump(hand, level, engine.getState().trumpState);
      
      if (trumpCards && trumpCards.length > 0) {
        const success = engine.tryDeclare(seat, trumpCards);
        if (success) {
          console.log(`  📣 ${seat} 亮主: ${formatCards(trumpCards)}`);
        }
      }
    }
    
    console.log();
  }
  
  // 设置底牌
  engine.setKitty(deck);
  console.log('📦 底牌已设置\n');
  
  // 完成亮主阶段
  engine.finalizeTrumpPhase();
  
  // 显示最终结果
  let state = engine.getState();
  let trump = state.trumpState.currentTrump;
  
  console.log('🎯 最终亮主结果\n');
  if (trump) {
    console.log(`  ✅ ${trump.declarer} 亮主成功`);
    console.log(`  主花色: ${trump.suit ? SUIT_NAMES[trump.suit] : '无主'}`);
      console.log(`  亮主牌数: ${trump.cards.length}张`);
    console.log(`  庄家: ${state.dealer.toUpperCase()}\n`);
  } else {
    console.log(`  ❌ 无人亮主，翻底牌决定主花色\n`);
  }
  
  // 显示底牌
  console.log('\n📦 底牌:');
  console.log(`  ${formatCards(engine.getState().kitty)}`);
  console.log();
  
  // 庄家扣底牌
  engine.discardPhase();
  console.log('📦 庄家获得底牌并扣回6张牌\n');
  
  // 炒底阶段
  engine.chaoDiPhase();
  
  const logs = engine.getLogs();
  const chaoDiLogs = logs.filter(l => l.type === 'chaoDi');
  
  if (chaoDiLogs.length > 0) {
    console.log('📦 炒底阶段\n');
    console.log('规则: 炒底成功者获得底牌，需要扣回6张牌\n');
    
    for (let i = 0; i < chaoDiLogs.length; i++) {
      const log = chaoDiLogs[i];
      console.log(`--- 炒底第 ${i + 1} 轮 ---\n`);
      console.log(`🔥 ${log.message}`);
      console.log(`   新主花色: ${log.details?.newTrump?.suit ? SUIT_NAMES[log.details.newTrump.suit] : '无主'}`);
      if (log.details?.receivedKitty) {
        console.log(`   获得底牌 (${log.details.receivedKitty.length}张): ${formatCards(log.details.receivedKitty)}`);
      }
      if (log.details?.discardedKitty) {
        console.log(`   扣回底牌 (${log.details.discardedKitty.length}张): ${formatCards(log.details.discardedKitty)}`);
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
  console.log(`庄家: ${state.dealer.toUpperCase()}`);
  
  // 显示亮牌人信息
  if (state.trumpState.currentTrump) {
    const declarer = state.trumpState.currentTrump.declarer;
    const cards = state.trumpState.currentTrump.cards;
    if (declarer && cards) {
      console.log(`亮牌人: ${declarer}`);
      console.log(`亮的牌: ${formatCards(cards)}`);
    }
  }
  console.log();
  
  
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

main();
