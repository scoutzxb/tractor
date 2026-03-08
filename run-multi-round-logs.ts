#!/usr/bin/env bun

// Multi-round game simulation with detailed logs output
// Runs games from level 2 to AA (victory) and saves detailed logs

import { createGameEngine } from './src/engine/game-loop';
import { SimpleAI } from './src/ai/simple-player';
import { playOutHands } from './src/engine/simulation';
import { leadCardsStrategy, followCardsStrategy, setThrowLeadRate, setCoverMode, setThrowRandomSource, setThrowSingleLevels } from './src/ai/play-strategy';
import type { Card, GameContext, Seat, Rank, TrumpState } from './src/core/types';
import { sortHand, SUIT_NAMES, seededRandom } from './src/core/deck';
import { getPartner, getDealerTeam } from './src/core/scoring';

// 解析命令行参数
function parseArgs(): { seed: number; maxGames: number; output: string; verbose: boolean } {
  const args = process.argv.slice(2);
  let seed = Math.floor(Math.random() * 1000000);
  let maxGames = 100;
  let output = 'game-logs';
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' || args[i].startsWith('--seed=')) {
      const v = args[i].includes('=') ? args[i].split('=')[1] : args[++i];
      seed = parseInt(v);
    } else if (args[i] === '--max-games' || args[i].startsWith('--max-games=')) {
      const v = args[i].includes('=') ? args[i].split('=')[1] : args[++i];
      maxGames = parseInt(v);
    } else if (args[i] === '--output' || args[i].startsWith('--output=')) {
      const v = args[i].includes('=') ? args[i].split('=')[1] : args[++i];
      output = v;
    } else if (args[i] === '--verbose') {
      verbose = true;
    }
  }

  return { seed, maxGames, output, verbose };
}

// 座位中文名
const SEAT_NAMES: Record<Seat, string> = {
  east: '东',
  north: '北',
  west: '西',
  south: '南'
};

// 格式化单张牌
function formatCard(card: Card | string): string {
  if (!card) return '?';
  if (typeof card === 'string') return card;
  if (card.joker) return card.joker === 'big' ? '大王' : '小王';
  return `${SUIT_NAMES[card.suit!]}${card.rank}`;
}

// 格式化一组牌
function formatCards(cards: (Card | string)[]): string {
  return cards.map(card => {
    if (typeof card === 'string') {
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

// 显示手牌（与test-game-modes.ts完全一致）
function displayHand(hand: Card[], ctx: GameContext): string {
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
      if (a.suit === ctx.trumpSuit && b.suit !== ctx.trumpSuit) return -1;
      if (b.suit === ctx.trumpSuit && a.suit !== ctx.trumpSuit) return 1;
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

async function main() {
  const { seed, maxGames, output: outputDir, verbose } = parseArgs();

  console.log('\n' + '='.repeat(80));
  console.log('🎴 多局游戏模拟 - 详细日志\n');
  console.log(`种子: ${seed}`);
  console.log(`最大局数: ${maxGames}`);
  console.log(`输出目录: ${outputDir}`);
  console.log(`详细输出: ${verbose}`);
  console.log(`严格校验: 开启（跟牌/张数不合法将直接报错，不会静默通过）\n`);

  // 创建输出目录
  const fs = await import('fs');
  const path = await import('path');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 初始化
  let teamLevels: { eastWest: Rank; northSouth: Rank } = { eastWest: '2', northSouth: '2' };
  let dealer: Seat = 'east';
  let gameCount = 0;
  let victory = false;
  let winningTeam: 'eastWest' | 'northSouth' | null = null;
  let jDemotionCount = 0;
  let dealerWins = 0;
  let defenderWins = 0;
  let totalThrowFailureCount = 0;

  const summaryLines: string[] = [];
  summaryLines.push(`# 多局游戏模拟总结\n`);
  summaryLines.push(`种子: ${seed}`);
  summaryLines.push(`开始时间: ${new Date().toISOString()}\n`);
  summaryLines.push(`严格校验: 开启（跟牌/张数不合法将直接报错，不会静默通过）\n`);
  summaryLines.push(`## 结果\n`);

  setThrowLeadRate(0.5);
  setCoverMode('aggressive');
  setThrowSingleLevels(1);
  setThrowRandomSource(seededRandom(seed + 100003));

  const seats: Seat[] = ['east', 'north', 'west', 'south'];

  while (!victory && gameCount < maxGames) {
    gameCount++;
    const gameFile = path.join(outputDir, `game_${String(gameCount).padStart(3, '0')}.md`);
    const logLines: string[] = [];
    const isFirstGame = gameCount === 1;
    const isGrabMode = isFirstGame; // 第一局是抢庄局

    const log = (msg: string) => {
      logLines.push(msg);
      if (verbose) console.log(msg);
    };

    log(`\n${'='.repeat(80)}`);
    log(`=== 第 ${gameCount} 局${isGrabMode ? ' (抢庄局)' : ''} ===`);
    log(`庄家: ${SEAT_NAMES[dealer]}, 东西级别: ${teamLevels.eastWest}, 南北级别: ${teamLevels.northSouth}`);
    log(`🔒 严格校验模式: 开启（本局若出现非法跟牌将立即中止）`);
    log('='.repeat(80));

    // 取庄家所在队伍的级别
    const dealerTeam = (dealer === 'east' || dealer === 'west') ? 'eastWest' : 'northSouth';
    const currentLevel = teamLevels[dealerTeam];

    // 创建引擎（第一局是抢庄局）
    const engine = createGameEngine(currentLevel, dealer, isGrabMode, seed + gameCount);

    // 注册玩家
    for (const seat of seats) {
      const player = new SimpleAI(seat, SEAT_NAMES[seat]);
      engine.registerPlayer(player);
    }

    // ========== 抓牌阶段 ==========
    log('\n--- 抓牌阶段 ---\n');

    const dealing = engine.runDealingAndDeclarationRounds(39);

    for (const round of dealing.rounds) {
      log(`第 ${round.round} 轮:`);

      const dealerIdx = seats.indexOf(engine.getState().dealer);

      for (let i = 0; i < 4; i++) {
        const seatIdx = (dealerIdx + i) % 4;
        const seat = seats[seatIdx];
        const card = round.cardsBySeat.get(seat);
        if (card) {
          log(`  ${SEAT_NAMES[seat]}: ${formatCard(card)}`);
        }
      }

      for (const d of round.declarations) {
        log(`  📣 ${SEAT_NAMES[d.seat]} 亮主: ${formatCards(d.cards)}`);
      }

      log('');
    }

    // ========== 亮主/底牌/扣底/炒底 ==========
    const trumpKitty = engine.runTrumpAndKittyFlow();

    log('--- 亮主/底牌/扣底/炒底阶段 ---\n');
    log(`底牌: ${formatCards(trumpKitty.kittyAfterDeal)}\n`);

    let state = trumpKitty.stateAfterFinalize;
    let trump = state.trumpState.currentTrump;

    if (trump) {
      log(`✅ ${SEAT_NAMES[trump.declarer!]} 亮主成功`);
      log(`   主花色: ${trump.suit ? SUIT_NAMES[trump.suit] : '无主'}`);
      log(`   亮主牌数: ${trump.cards.length}张`);
      if (isGrabMode && trump.declarer !== dealer) {
        log(`   🎯 ${SEAT_NAMES[trump.declarer!]} 成为庄家 (抢庄成功)`);
      }
      log(`   庄家: ${SEAT_NAMES[state.dealer]}\n`);
    } else {
      log(`❌ 无人亮主，翻底牌决定主花色\n`);
    }

    // 炒底阶段
    if (!state.trumpState.isGrabMode && trumpKitty.chaoDiLogs.length > 0) {
      log('--- 炒底阶段 ---\n');

      for (let i = 0; i < trumpKitty.chaoDiLogs.length; i++) {
        const logEntry = trumpKitty.chaoDiLogs[i];
        log(`炒底第 ${i + 1} 轮:`);
        log(`  🔥 ${logEntry.message}`);
        if (logEntry.details?.newTrump) {
          log(`  新主花色: ${logEntry.details.newTrump.suit ? SUIT_NAMES[logEntry.details.newTrump.suit] : '无主'}`);
        }
        if (logEntry.details?.receivedKitty) {
          log(`  获得底牌: ${formatCards(logEntry.details.receivedKitty)}`);
        }
        if (logEntry.details?.discardedKitty) {
          log(`  扣回底牌: ${formatCards(logEntry.details.discardedKitty)}`);
        }
        log('');
      }
    }

    state = trumpKitty.stateAfterChaoDi;
    trump = state.trumpState.currentTrump;

    log('最终状态:');
    log(`  主花色: ${state.ctx?.trumpSuit ? SUIT_NAMES[state.ctx.trumpSuit] : '无主'}`);
    log(`  庄家: ${SEAT_NAMES[state.dealer]}`);
    log(`  底牌: ${formatCards(state.kitty)}\n`);

    // 更新dealer（抢庄局可能改变）
    dealer = state.dealer;

    // ========== 显示初始手牌 ==========
    log('--- 初始手牌 ---\n');

    for (const seat of seats) {
      const hand = state.hands.get(seat) || [];
      const isDealer = seat === state.dealer;

      log(`${SEAT_NAMES[seat]} (${hand.length}张)${isDealer ? ' 【庄家】' : ''}:`);
      log(`  ${displayHand(hand, state.ctx!)}`);
      log('');
    }

    // ========== 出牌阶段 ==========
    log('--- 出牌阶段 ---\n');

    let sim;
    try {
      sim = playOutHands({
        seats,
        dealer: state.dealer,
        level: currentLevel,
        teamLevels,
        ctx: state.ctx!,
        kitty: state.kitty,
        hands: state.hands,
        strictValidation: true,
        leadStrategy: leadCardsStrategy,
        followStrategy: followCardsStrategy
      });
    } catch (err: any) {
      log(`\n❌ 严格校验失败，停止模拟`);
      log(`错误: ${err?.message || String(err)}`);
      fs.writeFileSync(gameFile, logLines.join('\n'));
      throw err;
    }

    for (const t of sim.tricks) {
      log(`\n第 ${t.round} 轮`);
      log('-'.repeat(40));
      log(`出牌顺序: ${t.playOrder.map(s => SEAT_NAMES[s]).join(' -> ')}\n`);

      if (t.throwFailure) {
        log(`⚠️  ${SEAT_NAMES[t.throwFailure.seat]} 试图甩牌: ${formatCards(t.throwFailure.attemptedCards)}`);
        log(`   甩牌失败: ${t.throwFailure.reason || '结构被压制'}`);
        log(`   按规则改出: ${formatCards(t.throwFailure.fallbackCards)}\n`);
      }

      for (const p of t.plays) {
        const label = p.seat === t.leader ? `${SEAT_NAMES[p.seat]} (首家)` : SEAT_NAMES[p.seat];
        log(`${label}: ${formatCards(p.cards)}`);
      }

      log(`\n🏆 ${SEAT_NAMES[t.winner]} 赢得此轮！获得 ${t.roundScore} 分`);

      const dealerPartner = getPartner(state.dealer);
      const dealerTeamScore = (t.scoresAfter.get(state.dealer) || 0) + (t.scoresAfter.get(dealerPartner) || 0);
      const defenderTeamScore = seats
        .filter(s => s !== state.dealer && s !== dealerPartner)
        .reduce((sum, s) => sum + (t.scoresAfter.get(s) || 0), 0);

      log(`\n累计得分:`);
      log(`  庄家方 (${SEAT_NAMES[state.dealer]} + ${SEAT_NAMES[dealerPartner]}): ${dealerTeamScore} 分`);
      log(`  防家方: ${defenderTeamScore} 分`);

      log('\n剩余手牌:');
      for (const seat of seats) {
        const hand = t.handsAfter.get(seat) || [];
        const isDealer = seat === state.dealer;
        log(`\n${SEAT_NAMES[seat]}${isDealer ? ' 【庄家】' : ''} (${hand.length}张):`);
        if (hand.length > 0) {
          log(`  ${displayHand(hand, state.ctx!)}`);
        }
      }

      log(`\n下一轮首家: ${SEAT_NAMES[t.winner]}`);
    }

    const gameThrowFailureCount = sim.tricks.filter(t => !!t.throwFailure).length;
    totalThrowFailureCount += gameThrowFailureCount;

    // ========== 结算 ==========
    log(`\n${'='.repeat(80)}`);
    log('--- 结算 ---\n');

    for (const seat of seats) {
      const score = sim.scores.get(seat) || 0;
      const isDealer = seat === state.dealer;
      log(`${SEAT_NAMES[seat]}${isDealer ? ' 【庄家】' : ''}: ${score} 分`);
    }

    if (sim.kittyBonus.applied) {
      log(`\n🧮 抠底: 底牌 ${sim.kittyBonus.baseScore} 分 × ${sim.kittyBonus.multiplier} = ${sim.kittyBonus.addedScore} 分（计入闲家）`);
    }

    if (sim.settle.jDemotion) {
      log(`⚠️  J抠底生效：庄家方降级到2`);
      jDemotionCount++;
    }

    const dealerPartner = getPartner(state.dealer);
    log(`\n庄家方 (${SEAT_NAMES[state.dealer]} + ${SEAT_NAMES[dealerPartner]}): ${sim.dealerTeamScore} 分`);
    log(`防家方: ${sim.defenderTeamScore} 分`);

    const winner = sim.settle.defenseUpgrade > 0 ? 'dealer' : 'defender';
    if (winner === 'dealer') {
      log(`\n🎉 庄家方获胜！`);
      dealerWins++;
    } else {
      log(`\n🎉 防家方获胜！（换庄到 ${SEAT_NAMES[sim.settle.nextDealer]}）`);
      defenderWins++;
    }

    log(`\n下一局庄家: ${SEAT_NAMES[sim.postRoundState.nextDealer]}`);
    log(`下一局级别: 东西=${sim.postRoundState.nextTeamLevels.eastWest}, 南北=${sim.postRoundState.nextTeamLevels.northSouth}`);

    log(`\n本局甩牌失败(自动降级)次数: ${gameThrowFailureCount}`);

    // 检查胜利
    if (sim.postRoundState.nextTeamLevels.eastWest === 'AA') {
      victory = true;
      winningTeam = 'eastWest';
      log(`\n🎉 东西队升过A，获胜！`);
    } else if (sim.postRoundState.nextTeamLevels.northSouth === 'AA') {
      victory = true;
      winningTeam = 'northSouth';
      log(`\n🎉 南北队升过A，获胜！`);
    }

    // 更新状态
    dealer = sim.postRoundState.nextDealer;
    teamLevels = sim.postRoundState.nextTeamLevels;

    // 写入本局日志
    fs.writeFileSync(gameFile, logLines.join('\n'));
  }

  // 写入总结
  summaryLines.push(`总局数: ${gameCount}`);
  summaryLines.push(`胜利: ${victory}`);
  summaryLines.push(`获胜队伍: ${winningTeam || '无'}`);
  summaryLines.push(`最终级别: 东西=${teamLevels.eastWest}, 南北=${teamLevels.northSouth}`);
  summaryLines.push(`J降级次数: ${jDemotionCount}`);
  summaryLines.push(`庄家胜: ${dealerWins}, 防家胜: ${defenderWins}`);
  summaryLines.push(`甩牌失败(自动降级)总次数: ${totalThrowFailureCount}`);

  const summaryPath = path.join(outputDir, 'SUMMARY.md');
  fs.writeFileSync(summaryPath, summaryLines.join('\n'));

  console.log('\n' + '='.repeat(80));
  console.log('=== 多局游戏模拟总结 ===');
  console.log(`总局数: ${gameCount}`);
  console.log(`胜利: ${victory}`);
  console.log(`获胜队伍: ${winningTeam || '无'}`);
  console.log(`最终级别: 东西=${teamLevels.eastWest}, 南北=${teamLevels.northSouth}`);
  console.log(`J降级次数: ${jDemotionCount}`);
  console.log(`庄家胜: ${dealerWins}, 防家胜: ${defenderWins}`);
  console.log(`甩牌失败(自动降级)总次数: ${totalThrowFailureCount}`);
  console.log(`\n📄 总结已保存到: ${summaryPath}`);
  console.log(`📁 游戏日志已保存到: ${outputDir}/\n`);
}

main();
