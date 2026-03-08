#!/usr/bin/env bun

// 拖拉机游戏命令行界面

import { createGameEngine, type GameLog } from './src/engine/game-loop';
import { createAIPlayer } from './src/engine/ai-player';
import type { Seat, Rank, Card, Suit } from './src/core/types';
import { getCardDisplayName, getSuitDisplayName, sortHand, classifyCard } from './src/core/deck';

// 格式化牌
function formatCards(cards: any[]): string {
  return cards.map(c => getCardDisplayName(c)).join(' ');
}

// 打印日志
function printLog(log: GameLog, ctx?: GameContext): void {
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
  console.log(`\n[${time}] ${log.message}`);
  
  if (log.details) {
    console.log('  ', JSON.stringify(log.details, null, 2).replace(/\n/g, '\n  '));
  }
  
  // 显示底牌
  if (log.kitty && log.kitty.length > 0) {
    console.log('\n📦 底牌:');
    if (ctx) {
      const sortedKitty = sortHand([...log.kitty], ctx);
      const kittyDisplay = sortedKitty.map(c => getCardDisplayName(c)).join(' ');
      console.log(`  ${kittyDisplay}`);
    } else {
      const kittyDisplay = log.kitty.map(c => getCardDisplayName(c)).join(' ');
      console.log(`  ${kittyDisplay}`);
    }
  }
  
  // 显示手牌（只有在有ctx且不是发牌阶段时才显示）
  if (log.hands && ctx && log.type !== 'deal') {
    console.log('\n当前手牌:');
    displayHands(log.hands, ctx);
  }
  console.log('');
}

// 显示手牌（按主牌、副牌排序）
function displayHands(
  hands: Map<Seat, Card[]>,
  ctx: any,
  showDetail: boolean = true
): void {
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  
  console.log('\n当前手牌:');
  
  for (const seat of seats) {
    const hand = hands.get(seat) || [];
    if (hand.length === 0) {
      console.log(`  ${seat}: (无手牌)`);
      continue;
    }
    
    // 按主牌、副牌排序
    const sortedHand = sortHand([...hand], ctx);
    
    // 分类显示
    const trumpCards: Card[] = [];
    const suitCards: Map<Suit, Card[]> = new Map();
    
    for (const card of sortedHand) {
      const classInfo = classifyCard(card, ctx);
      if (classInfo === 'trump') {
        trumpCards.push(card);
      } else {
        const suit = (classInfo as { suit: Suit }).suit;
        if (!suitCards.has(suit)) {
          suitCards.set(suit, []);
        }
        suitCards.get(suit)!.push(card);
      }
    }
    
    // 显示
    const parts: string[] = [];
    
    // 主牌
    if (trumpCards.length > 0) {
      const trumpStr = trumpCards.map(c => getCardDisplayName(c)).join(' ');
      parts.push(`【主牌】${trumpStr}`);
    }
    
    // 副牌（按黑桃、红桃、梅花、方块顺序）
    const suitOrder: Suit[] = ['spade', 'heart', 'club', 'diamond'];
    for (const suit of suitOrder) {
      const cards = suitCards.get(suit) || [];
      if (cards.length > 0) {
        const suitStr = cards.map(c => getCardDisplayName(c)).join(' ');
        const suitName = getSuitDisplayName(suit);
        parts.push(`【${suitName}】${suitStr}`);
      }
    }
    
    if (showDetail) {
      console.log(`  ${seat}:`);
      parts.forEach(p => console.log(`    ${p}`));
    } else {
      console.log(`  ${seat}: ${sortedHand.map(c => getCardDisplayName(c)).join(' ')}`);
    }
  }
}

// 运行一局游戏（详细模式）
function playGameDetailed(): void {
  console.log('\n🎴 开始新游戏\n');
  
  const engine = createGameEngine('2', 'east');
  
  // 注册AI玩家
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  for (const seat of seats) {
    engine.registerPlayer(createAIPlayer(seat));
  }
  
  // 运行游戏
  const state = engine.runOneGame();
  
  // 打印结果
  console.log('\n📋 游戏日志:\n');
  
  // 只显示前5轮和后5轮的详细日志
  const logs = engine.getLogs();
  let roundCount = 0;
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    
    // 统计轮次
    if (log.type === 'trick') {
      roundCount++;
    }
    
    // 显示前5轮的详细日志
    if (roundCount <= 5 || log.type !== 'play') {
      printLog(log, log.ctx);  // 传入log.ctx
    } else if (roundCount === 6 && log.type === 'play') {
      console.log('\n... 省略中间轮次 ...\n');
    }
    
    // 显示最后5轮的详细日志
    if (roundCount > 34 && roundCount <= 39) {
      if (log.type === 'play') {
        printLog(log, log.ctx);  // 传入log.ctx
      }
    }
  }
  
  console.log('\n📊 游戏结果:');
  console.log(`  庄家: ${state.dealer}`);
  console.log(`  级别: ${state.level}`);
  console.log(`  胜者: ${state.winner === 'dealer' ? '庄家方' : '攻方'}`);
  
  console.log('\n💰 得分情况:');
  state.scores.forEach((score, seat) => {
    console.log(`  ${seat}: ${score} 分`);
  });
  
  if (state.isOver) {
    console.log('\n🎉 游戏结束！');
    console.log(`  最终胜者: ${state.winner === 'dealer' ? '庄家方' : '攻方'}`);
  }
}

// 运行多局游戏测试
function runMultipleGames(count: number): void {
  console.log(`\n🔄 运行 ${count} 局游戏测试...\n`);
  
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const errors: Error[] = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const engine = createGameEngine('2', 'east');
      
      const seats: Seat[] = ['east', 'north', 'west', 'south'];
      for (const seat of seats) {
        engine.registerPlayer(createAIPlayer(seat));
      }
      
      engine.runOneGame();
      successCount++;
      
      // 每100局打印进度
      if ((i + 1) % 100 === 0) {
        console.log(`  已完成 ${i + 1}/${count} 局`);
      }
    } catch (error) {
      errorCount++;
      errors.push(error as Error);
      console.error(`  ❌ 第 ${i + 1} 局失败:`, error);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  console.log('\n📈 测试结果:');
  console.log(`  总局数: ${count}`);
  console.log(`  成功: ${successCount}`);
  console.log(`  失败: ${errorCount}`);
  console.log(`  耗时: ${duration.toFixed(2)} 秒`);
  console.log(`  平均: ${(duration / count * 1000).toFixed(2)} 毫秒/局`);
  
  if (errors.length > 0) {
    console.log('\n❌ 错误详情:');
    errors.slice(0, 5).forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.message}`);
    });
    if (errors.length > 5) {
      console.log(`  ... 还有 ${errors.length - 5} 个错误`);
    }
  }
}

// 运行一局游戏
function runGame(detailed: boolean): void {
  if (detailed) {
    playGameDetailed();
  } else {
    console.log('\n🔄 快速运行1局游戏...\n');
    
    const engine = createGameEngine('2', 'east');
    
    // 注册AI玩家
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    for (const seat of seats) {
      engine.registerPlayer(createAIPlayer(seat));
    }
    
    // 运行游戏
    engine.runOneGame();
    
    console.log('\n🎉 游戏结束！');
  }
}

// 主函数
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // 默认：运行1局，详细日志
    runGame(true);
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'test':
      // 运行测试（1000局）
      const count = parseInt(args[1]) || 1000;
      runMultipleGames(count);
      break;
    
    case 'play':
      // 运行1局，详细日志
      runGame(true);
      break;
    
    case 'quick':
      // 快速运行1局，无详细日志
      runGame(false);
      break;
    
    default:
      console.log('用法:');
      console.log('  bun run cli.ts           # 运行1局游戏（详细日志）');
      console.log('  bun run cli.ts play      # 运行1局游戏（详细日志）');
      console.log('  bun run cli.ts quick     # 快速运行1局游戏');
      console.log('  bun run cli.ts test [N]  # 运行N局测试（默认1000局）');
  }
}

main();
