#!/usr/bin/env bun

// 测试不同游戏模式 - 抢庄局和非抢庄局

import { GameEngine, createGameEngine } from './src/engine/game-loop';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { sortHand, SUIT_NAMES, compareCards, classifyCard, seededRandom } from './src/core/deck';
import { parseCards, getPlaySuit } from './src/core/parser';
import { enumerateCards, formatEnumerateResult } from './src/core/parser-enumerate';
import { leadCardsStrategy, followCardsStrategy, setThrowLeadRate, setThrowRandomSource, setCoverMode, setThrowSingleLevels } from './src/ai/play-strategy';
import { SimpleAI } from './src/ai/simple-player';
import { getWinningPlay } from './src/core/trick-judge';
import { calculateResult, getPartner, calculateDefenderKittyBonus } from './src/core/scoring';
import { playOutHands } from './src/engine/simulation';

// 解析命令行参数
function parseArgs(): { mode: 'grab' | 'normal'; level: Rank; dealer: Seat; seed?: number; throwRate: number; coverMode: 'aggressive' | 'conservative'; throwSingleLevels: number; eastWestLevel: Rank; northSouthLevel: Rank } {
  const raw = process.argv.slice(2);
  const args: string[] = [];
  const validLevels = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let throwRate = 0.5;
  let coverMode: 'aggressive' | 'conservative' = 'aggressive';
  let throwSingleLevels = 1;
  let eastWestLevel: Rank | null = null;
  let northSouthLevel: Rank | null = null;

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a.startsWith('--throw-rate=')) {
      const v = parseFloat(a.split('=')[1]);
      if (!isNaN(v)) throwRate = Math.max(0, Math.min(1, v));
      continue;
    }
    if (a === '--throw-rate') {
      const v = parseFloat(raw[i + 1] || '');
      if (!isNaN(v)) throwRate = Math.max(0, Math.min(1, v));
      i++;
      continue;
    }
    if (a.startsWith('--cover-mode=')) {
      const v = a.split('=')[1];
      if (v === 'aggressive' || v === 'conservative') coverMode = v;
      continue;
    }
    if (a === '--cover-mode') {
      const v = raw[i + 1];
      if (v === 'aggressive' || v === 'conservative') coverMode = v;
      i++;
      continue;
    }
    if (a.startsWith('--throw-single-levels=')) {
      const v = parseInt(a.split('=')[1]);
      if (!isNaN(v)) throwSingleLevels = Math.max(0, v);
      continue;
    }
    if (a === '--throw-single-levels') {
      const v = parseInt(raw[i + 1] || '');
      if (!isNaN(v)) throwSingleLevels = Math.max(0, v);
      i++;
      continue;
    }
    if (a.startsWith('--east-west-level=')) {
      const v = a.split('=')[1] as Rank;
      eastWestLevel = v;
      continue;
    }
    if (a === '--east-west-level') {
      eastWestLevel = (raw[i + 1] as Rank) || null;
      i++;
      continue;
    }
    if (a.startsWith('--north-south-level=')) {
      const v = a.split('=')[1] as Rank;
      northSouthLevel = v;
      continue;
    }
    if (a === '--north-south-level') {
      northSouthLevel = (raw[i + 1] as Rank) || null;
      i++;
      continue;
    }
    args.push(a);
  }
  
  if (args.length === 0) {
    console.log('用法:');
    console.log('  抢庄局: bun test-game-modes.ts grab [seed] [--throw-rate 0.5] [--cover-mode aggressive] [--throw-single-levels 1]');
    console.log('  非抢庄局: bun test-game-modes.ts <level> <dealer> [seed] [--throw-rate 0.5] [--cover-mode aggressive] [--throw-single-levels 1]');
    console.log('  例如: bun test-game-modes.ts 5 north 12345 --throw-rate 0.8 --cover-mode conservative --throw-single-levels 2');
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
  
  if (eastWestLevel && !validLevels.includes(eastWestLevel)) {
    console.error(`错误: 东西级别必须是 ${validLevels.join(', ')}`);
    process.exit(1);
  }
  if (northSouthLevel && !validLevels.includes(northSouthLevel)) {
    console.error(`错误: 南北级别必须是 ${validLevels.join(', ')}`);
    process.exit(1);
  }

  return {
    mode,
    level,
    dealer,
    seed,
    throwRate,
    coverMode,
    throwSingleLevels,
    eastWestLevel: eastWestLevel || level,
    northSouthLevel: northSouthLevel || level
  };
}

// 格式化单张牌
function formatCard(card: Card | string): string {
  if (!card) return '?';  // Safety check for undefined
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
  // Filter out undefined/null cards
  const validHand = hand.filter(c => c != null);
  
  const sorted = sortHand([...validHand], ctx);
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

// 显示手牌的牌型解析结果
function displayParsedHand(hand: Card[], ctx: GameContext): string {
  const components = parseCards(hand, ctx);
  
  if (components.length === 0) {
    return '  (无牌型)';
  }
  
  const lines: string[] = [];
  
  // 按牌型优先级分组显示
  const superTractors = components.filter(c => c.type === 'super_tractor');
  const triples = components.filter(c => c.type === 'triple');
  const tractors = components.filter(c => c.type === 'tractor');
  const pairs = components.filter(c => c.type === 'pair');
  const singles = components.filter(c => c.type === 'single');
  
  if (superTractors.length > 0) {
    lines.push('【超级拖拉机】');
    for (const comp of superTractors) {
      const cardStr = formatCards(comp.cards);
      const len = comp.length || (comp.cards.length / 3);
      lines.push(`  ${len}连: ${cardStr}`);
    }
  }
  
  if (triples.length > 0) {
    lines.push('【三张】');
    for (const comp of triples) {
      const cardStr = formatCards(comp.cards);
      lines.push(`  ${cardStr}`);
    }
  }
  
  if (tractors.length > 0) {
    lines.push('【拖拉机】');
    for (const comp of tractors) {
      const cardStr = formatCards(comp.cards);
      const len = comp.length || (comp.cards.length / 2);
      lines.push(`  ${len}连: ${cardStr}`);
    }
  }
  
  if (pairs.length > 0) {
    lines.push('【对子】');
    for (const comp of pairs) {
      const cardStr = formatCards(comp.cards);
      lines.push(`  ${cardStr}`);
    }
  }
  
  if (singles.length > 0) {
    lines.push(`【单牌】 ${singles.length}张`);
    // 单牌太多就只显示数量，不逐张显示
    if (singles.length <= 10) {
      const cardStr = singles.map(c => formatCard(c.cards[0])).join(' ');
      lines.push(`  ${cardStr}`);
    }
  }
  
  return lines.join('\n');
}

// 显示枚举型parser的结果
function displayEnumeratedHand(hand: Card[], ctx: GameContext): string {
  const result = enumerateCards(hand, ctx);
  return formatEnumerateResult(result, ctx);
}

// 主函数
function main() {
  const { mode, level, dealer, seed, throwRate, coverMode, throwSingleLevels, eastWestLevel, northSouthLevel } = parseArgs();
  setThrowLeadRate(throwRate);
  setCoverMode(coverMode);
  setThrowSingleLevels(throwSingleLevels);
  
  // 如果没有提供种子，生成一个随机种子
  const actualSeed = seed || Math.floor(Math.random() * 1000000);
  setThrowRandomSource(seededRandom(actualSeed + 100003));
  
  console.log('\n🎴 拖拉机游戏测试\n');
  console.log('='.repeat(80));
  console.log(`模式: ${mode === 'grab' ? '抢庄局' : '非抢庄局'}`);
  console.log(`级别: ${level}`);
  console.log(`庄家: ${dealer.toUpperCase()}`);
  console.log(`种子: ${actualSeed}${seed ? '' : ' (随机生成)'}`);
  console.log(`甩牌测试概率: ${Math.round(throwRate * 100)}%`);
  console.log(`跟牌压前策略: ${coverMode}`);
  console.log(`甩牌带单等级: ${throwSingleLevels}`);
  console.log(`队伍级别: 东西=${eastWestLevel}, 南北=${northSouthLevel}`);
  
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
  
  // ========== 抓牌阶段（两种模式相同）==========
  console.log('\n开始抓牌过程...\n');

  const dealing = engine.runDealingAndDeclarationRounds(39);
  const deck = dealing.deck;

  for (const round of dealing.rounds) {
    console.log(`--- 第 ${round.round} 轮抓牌 ---`);

    const allSeats: Seat[] = ['east', 'north', 'west', 'south'];
    const dealerIdx = allSeats.indexOf(engine.getState().dealer);

    for (let i = 0; i < 4; i++) {
      const seatIdx = (dealerIdx + i) % 4;
      const seat = allSeats[seatIdx];
      const card = round.cardsBySeat.get(seat);
      if (card) {
        console.log(`  ${seat}: ${formatCard(card)}`);
      }
    }

    for (const d of round.declarations) {
      console.log(`  📣 ${d.seat} 亮主: ${formatCards(d.cards)}`);
    }

    console.log();
  }
  
  // ========== 亮主/底牌/扣底/炒底（引擎流程） ==========
  const trumpKitty = engine.runTrumpAndKittyFlow();

  console.log('📦 底牌已设置\n');
  console.log('底牌:');
  console.log(`  ${formatCards(trumpKitty.kittyAfterDeal)}`);
  console.log();

  let state = trumpKitty.stateAfterFinalize;
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

  console.log('📦 庄家获得底牌并扣回6张牌\n');

  if (!state.trumpState.isGrabMode) {
    if (trumpKitty.chaoDiLogs.length > 0) {
      console.log('📦 炒底阶段\n');
      console.log('规则: 炒底成功者获得底牌，需要扣回6张牌\n');
      
      for (let i = 0; i < trumpKitty.chaoDiLogs.length; i++) {
        const log = trumpKitty.chaoDiLogs[i];
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
  }

  state = trumpKitty.stateAfterChaoDi;
  trump = state.trumpState.currentTrump;
  
  // ========== 炒底后统一流程 ==========
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
  
  // 先显示所有玩家的最终手牌
  console.log('所有玩家的最终手牌:\n');
  
  for (const seat of seats) {
    const hand = state.hands.get(seat) || [];
    const isDealer = seat === state.dealer;
    
    console.log(`${seat} (${hand.length}张)${isDealer ? ' 【庄家】' : ''}:`);
    console.log(`  ${displayHand(hand, state.ctx!)}`);
    console.log();
  }
  
  // 开始完整游戏循环
  console.log('\n' + '='.repeat(80));
  console.log('🎴 完整游戏循环\n');
  console.log('规则：庄家先出牌，顺时针轮流，每轮判断胜负，胜者下一轮先出\n');

  const sim = playOutHands({
    seats,
    dealer: state.dealer,
    level,
    teamLevels: { eastWest: eastWestLevel, northSouth: northSouthLevel },
    ctx: state.ctx!,
    kitty: state.kitty,
    hands: state.hands,
    leadStrategy: leadCardsStrategy,
    followStrategy: followCardsStrategy
  });

  for (const t of sim.tricks) {
    console.log(`\n第 ${t.round} 轮`);
    console.log('='.repeat(60));
    console.log(`出牌顺序: ${t.playOrder.join(' -> ')}\n`);

    if (t.throwFailure) {
      console.log(`⚠️  ${t.throwFailure.seat} 试图甩牌: ${formatCards(t.throwFailure.attemptedCards)}`);
      console.log(`   甩牌失败: ${t.throwFailure.reason || '结构被压制'}`);
      console.log(`   按规则改出: ${formatCards(t.throwFailure.fallbackCards)}\n`);
    }

    for (const p of t.plays) {
      const label = p.seat === t.leader ? `${p.seat} (首家)` : p.seat;
      console.log(`${label}: ${formatCards(p.cards)}`);
    }

    console.log(`\n🏆 ${t.winner} 赢得此轮！获得 ${t.roundScore} 分`);

    const dealerPartnerForScore = getPartner(state.dealer);
    const dealerTeamScore = (t.scoresAfter.get(state.dealer) || 0) + (t.scoresAfter.get(dealerPartnerForScore) || 0);
    const defenderTeamScore = seats
      .filter(s => s !== state.dealer && s !== dealerPartnerForScore)
      .reduce((sum, s) => sum + (t.scoresAfter.get(s) || 0), 0);

    console.log(`\n累计得分:`);
    console.log(`  庄家方 (${state.dealer} + ${dealerPartnerForScore}): ${dealerTeamScore} 分`);
    console.log(`  防家方: ${defenderTeamScore} 分`);

    console.log('\n剩余手牌:');
    for (const seat of seats) {
      const hand = t.handsAfter.get(seat) || [];
      const isDealer = seat === state.dealer;
      console.log(`\n${seat}${isDealer ? ' 【庄家】' : ''} (${hand.length}张):`);
      if (hand.length > 0) {
        console.log(`  ${displayHand(hand, state.ctx!)}`);
      }
    }

    console.log(`\n下一轮首家: ${t.winner}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎯 最终得分\n');

  for (const seat of seats) {
    const score = sim.scores.get(seat) || 0;
    const isDealer = seat === state.dealer;
    console.log(`${seat}${isDealer ? ' 【庄家】' : ''}: ${score} 分`);
  }

  if (sim.kittyBonus.applied) {
    console.log(`\n🧮 抠底: 底牌 ${sim.kittyBonus.baseScore} 分 × ${sim.kittyBonus.multiplier} = ${sim.kittyBonus.addedScore} 分（计入闲家）`);
  }
  if (sim.settle.jDemotion) {
    console.log(`⚠️  J抠底生效：庄家方降级到2（按核心计分规则）`);
  }

  const dealerPartnerFinal = getPartner(state.dealer);
  console.log(`\n庄家方 (${state.dealer} + ${dealerPartnerFinal}): ${sim.dealerTeamScore} 分`);
  console.log(`防家方: ${sim.defenderTeamScore} 分`);

  if (sim.settle.defenseUpgrade > 0) {
    console.log(`\n🎉 庄家方获胜！（防家未到过庄线）`);
  } else {
    console.log(`\n🎉 防家方获胜！（过庄，换庄到 ${sim.settle.nextDealer.toUpperCase()}）`);
  }

  console.log(`\n➡️ 下一局庄家（核心计算）: ${sim.postRoundState.nextDealer.toUpperCase()}`);
  console.log(`➡️ 下一局级别（核心计算）: 东西=${sim.postRoundState.nextTeamLevels.eastWest}, 南北=${sim.postRoundState.nextTeamLevels.northSouth}`);
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  console.log('✅ 测试完成\n');
}

main();
