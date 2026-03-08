#!/usr/bin/env bun

// 测试正确的炒底流程 - 策略版本（含花色优先级）
// 场景：初始亮主只用单张级牌，炒底时才用更强的牌型
// 规则：相同优先级时，黑桃 > 红桃 > 梅花 > 方块

import { createDeck, shuffle, deal, sortHand, isTrump, getCardDisplayName, SUIT_NAMES } from './src/core/deck';
import { TRUMP_PRIORITY } from './src/core/trump-state';
import type { Card, Suit, Rank, Seat, GameContext } from './src/core/types';

// 庄家从一开始就固定
const DEALER: Seat = 'east';

// 优先级名称
const PRIORITY_NAMES: Record<number, string> = {
  [TRUMP_PRIORITY.THREE_BIG_JOKER]: '三大王',
  [TRUMP_PRIORITY.THREE_SMALL_JOKER]: '三小王',
  [TRUMP_PRIORITY.THREE_SAME_SUIT]: '三张同花色级牌',
  [TRUMP_PRIORITY.PAIR_BIG_JOKER]: '一对大王',
  [TRUMP_PRIORITY.PAIR_SMALL_JOKER]: '一对小王',
  [TRUMP_PRIORITY.PAIR_SAME_SUIT]: '一对同花色级牌',
  [TRUMP_PRIORITY.SINGLE_SUIT]: '单张级牌'
};

// 花色优先级（黑桃 > 红桃 > 梅花 > 方块）
const SUIT_PRIORITY: Record<Suit, number> = {
  spade: 0,
  heart: 1,
  club: 2,
  diamond: 3
};

// 比较两个declaration的大小
// 返回负数表示a < b，正数表示a > b，0表示相等
function compareDeclarations(
  a: { priority: number; suit: Suit | null },
  b: { priority: number; suit: Suit | null }
): number {
  // 先比较优先级（数字越小越大）
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  
  // 优先级相同，比较花色
  // 无主（null）最小
  if (a.suit === null && b.suit === null) return 0;
  if (a.suit === null) return 1; // b有花色，b更大
  if (b.suit === null) return -1; // a有花色，a更大
  
  // 都有花色，按黑桃 > 红桃 > 梅花 > 方块
  return SUIT_PRIORITY[a.suit] - SUIT_PRIORITY[b.suit];
}

// 辅助函数
function card(c: Card): string {
  return getCardDisplayName(c);
}

function analyzeHandForTrump(hand: Card[], level: Rank, onlySingle: boolean = false): { priority: number; suit: Suit | null; cards: Card[]; desc: string }[] {
  const results: { priority: number; suit: Suit | null; cards: Card[]; desc: string }[] = [];
  
  // 统计
  const counts = new Map<string, Card[]>();
  for (const card of hand) {
    const key = card.joker ? `JOKER_${card.joker.toUpperCase()}` : `${card.suit}_${card.rank}`;
    if (!counts.has(key)) counts.set(key, []);
    counts.get(key)!.push(card);
  }
  
  // 如果只要单张级牌，跳过其他
  if (!onlySingle) {
    // 三大王
    const bigJokers = counts.get('JOKER_BIG') || [];
    if (bigJokers.length >= 3) {
      results.push({ priority: TRUMP_PRIORITY.THREE_BIG_JOKER, suit: null, cards: bigJokers.slice(0, 3), desc: '三大王' });
    }
    
    // 三小王
    const smallJokers = counts.get('JOKER_SMALL') || [];
    if (smallJokers.length >= 3) {
      results.push({ priority: TRUMP_PRIORITY.THREE_SMALL_JOKER, suit: null, cards: smallJokers.slice(0, 3), desc: '三小王' });
    }
    
    // 三张同花色级牌
    const levelCards = new Map<Suit, Card[]>();
    for (const [key, cardList] of counts) {
      if (key.startsWith('spade_') || key.startsWith('heart_') || key.startsWith('club_') || key.startsWith('diamond_')) {
        const suit = cardList[0].suit!;
        if (cardList[0].rank === level) {
          if (!levelCards.has(suit)) levelCards.set(suit, []);
          levelCards.get(suit)!.push(...cardList);
        }
      }
    }
    
    for (const [suit, cards] of levelCards) {
      if (cards.length >= 3) {
        results.push({ priority: TRUMP_PRIORITY.THREE_SAME_SUIT, suit, cards: cards.slice(0, 3), desc: `三张${SUIT_NAMES[suit]}${level}` });
      }
    }
    
    // 一对大王
    if (bigJokers.length >= 2) {
      results.push({ priority: TRUMP_PRIORITY.PAIR_BIG_JOKER, suit: null, cards: bigJokers.slice(0, 2), desc: '一对大王' });
    }
    
    // 一对小王
    if (smallJokers.length >= 2) {
      results.push({ priority: TRUMP_PRIORITY.PAIR_SMALL_JOKER, suit: null, cards: smallJokers.slice(0, 2), desc: '一对小王' });
    }
    
    // 一对同花色级牌
    for (const [suit, cards] of levelCards) {
      if (cards.length >= 2) {
        results.push({ priority: TRUMP_PRIORITY.PAIR_SAME_SUIT, suit, cards: cards.slice(0, 2), desc: `一对${SUIT_NAMES[suit]}${level}` });
      }
    }
  }
  
  // 单张级牌（初始亮主阶段可用）
  const levelCards = new Map<Suit, Card[]>();
  for (const [key, cardList] of counts) {
    if (key.startsWith('spade_') || key.startsWith('heart_') || key.startsWith('club_') || key.startsWith('diamond_')) {
      const suit = cardList[0].suit!;
      if (cardList[0].rank === level) {
        if (!levelCards.has(suit)) levelCards.set(suit, []);
        levelCards.get(suit)!.push(...cardList);
      }
    }
  }
  
  for (const [suit, cards] of levelCards) {
    if (cards.length >= 1) {
      results.push({ priority: TRUMP_PRIORITY.SINGLE_SUIT, suit, cards: [cards[0]], desc: `单张${SUIT_NAMES[suit]}${level}` });
    }
  }
  
  // 按优先级和花色排序
  return results.sort((a, b) => compareDeclarations(a, b));
}

function displayHand(hand: Card[], ctx: GameContext): string {
  const sorted = sortHand([...hand], ctx);
  const groups: { label: string; cards: Card[] }[] = [];
  
  // 主牌
  const trumps = sorted.filter(c => isTrump(c, ctx));
  if (trumps.length > 0) {
    groups.push({ label: '【主牌】', cards: trumps });
  }
  
  // 副牌
  for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
    const suitCards = sorted.filter(c => !isTrump(c, ctx) && c.suit === suit);
    if (suitCards.length > 0) {
      groups.push({ label: `【${SUIT_NAMES[suit]}】`, cards: suitCards });
    }
  }
  
  return groups.map(g => `${g.label} ${g.cards.map(c => card(c)).join(' ')}`).join('\n  ');
}

function testCorrectChaoDi() {
  console.log('\n🎴 正确的炒底流程测试 - 策略版本（含花色优先级）');
  console.log('================================================================================');
  console.log(`\n📌 庄家固定为: ${DEALER.toUpperCase()}`);
  console.log('📌 初始亮主只用单张级牌（保留实力）');
  console.log('📌 炒底时才用一对、三张等更强牌型');
  console.log('📌 相同优先级时，黑桃 > 红桃 > 梅花 > 方块');
  console.log('📌 炒底是在庄家扣底牌后，其他人可以夺底\n');
  
  // 准备牌
  const deck = shuffle(createDeck());
  const { hands, kitty } = deal(deck);
  const level: Rank = '2';
  
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  
  // 阶段1: 抓牌完成
  console.log('📦 阶段1: 抓牌完成\n');
  console.log('所有玩家的手牌和亮主机会:\n');
  
  for (const seat of seats) {
    const hand = hands[seats.indexOf(seat)];
    const allDeclarations = analyzeHandForTrump(hand, level, false);
    const singleDeclarations = analyzeHandForTrump(hand, level, true);
    const counts = { bigJoker: 0, smallJoker: 0, spade: 0, heart: 0, club: 0, diamond: 0 };
    
    for (const c of hand) {
      if (c.joker === 'big') counts.bigJoker++;
      else if (c.joker === 'small') counts.smallJoker++;
      else if (c.rank === level) counts[c.suit!]++;
    }
    
    console.log(`${seat} (${hand.length}张)${seat === DEALER ? ' 【庄家】' : ''}:`);
    console.log(`  大王${counts.bigJoker}张 小王${counts.smallJoker}张 ` +
      `黑桃${level}:${counts.spade}张 红桃${level}:${counts.heart}张 ` +
      `梅花${level}:${counts.club}张 方块${level}:${counts.diamond}张`);
    
    if (allDeclarations.length > 0) {
      console.log('  所有可亮的主:');
      allDeclarations.forEach(d => {
        const isSingle = d.priority === TRUMP_PRIORITY.SINGLE_SUIT;
        console.log(`    ${isSingle ? '✓' : '○'} ${d.desc} (${d.suit ? SUIT_NAMES[d.suit] + '主' : '无主'}，优先级${d.priority})${isSingle ? ' [初始可用]' : ' [炒底可用]'}`);
      });
    } else {
      console.log('  可亮的主: (无)');
    }
    console.log();
  }
  
  // 阶段2: 初始亮主（只用单张级牌）
  console.log('\n📦 阶段2: 初始亮主阶段（只用单张级牌）\n');
  console.log('策略: 玩家只用单张级牌亮主，保留一对、三张等更强牌型用于炒底\n');
  
  let currentDeclaration: { priority: number; suit: Suit | null; cards: Card[]; declarer: Seat; desc: string } | null = null;
  const declarationLog: string[] = [];
  
  // 按座位顺序尝试亮主（只用单张）
  for (const seat of seats) {
    const hand = hands[seats.indexOf(seat)];
    const singleDeclarations = analyzeHandForTrump(hand, level, true); // 只用单张
    
    // 找最高优先级的单张
    const best = singleDeclarations[0];
    if (!best) continue;
    
    // 必须比当前高（考虑优先级和花色）
    if (currentDeclaration && compareDeclarations(best, currentDeclaration) >= 0) continue;
    
    // 不能同一花色
    if (currentDeclaration && best.suit === currentDeclaration.suit) continue;
    
    currentDeclaration = { ...best, declarer: seat };
    declarationLog.push(`📣 ${seat} 亮主: ${best.desc} (${best.suit ? SUIT_NAMES[best.suit] + '主' : '无主'}，优先级${best.priority})`);
  }
  
  declarationLog.forEach(log => console.log(log));
  
  if (!currentDeclaration) {
    console.log('\n无人亮主，翻底牌决定主花色');
    return;
  }
  
  console.log(`\n✅ 初始亮主完成: ${currentDeclaration.declarer} 亮出 ${currentDeclaration.desc}`);
  console.log(`   主花色: ${currentDeclaration.suit ? SUIT_NAMES[currentDeclaration.suit] : '无主'}`);
  console.log(`   庄家仍然是: ${DEALER.toUpperCase()}\n`);
  
  // 阶段3: 庄家获得底牌
  console.log('\n📦 阶段3: 庄家获得底牌\n');
  console.log(`庄家 ${DEALER} 获得底牌: ${kitty.map(c => card(c)).join(' ')}\n`);
  
  const dealerHand = [...hands[seats.indexOf(DEALER)], ...kitty];
  console.log(`${DEALER} 现在有 ${dealerHand.length} 张牌\n`);
  
  // 阶段4: 庄家扣底牌
  console.log('\n📦 阶段4: 庄家扣底牌\n');
  console.log('庄家需要扣掉6张牌到底牌区...\n');
  
  // 简单策略：扣最小的6张副牌
  const ctx: GameContext = { level, trumpSuit: currentDeclaration.suit };
  const sorted = sortHand([...dealerHand], ctx);
  const nonTrumps = sorted.filter(c => !isTrump(c, ctx));
  const toDiscard = nonTrumps.slice(-6);
  
  console.log(`${DEALER} 扣底牌: ${toDiscard.map(c => card(c)).join(' ')}`);
  
  const dealerHandAfterDiscard = dealerHand.filter(c => !toDiscard.includes(c));
  console.log(`${DEALER} 扣底后剩余 ${dealerHandAfterDiscard.length} 张牌\n`);
  
  // 阶段5: 炒底阶段（可以用所有牌型）
  console.log('\n📦 阶段5: 炒底阶段（可以用一对、三张等更强牌型）\n');
  console.log('规则:');
  console.log('  - 其他人可以用更高优先级的牌亮主（一对、三张等）');
  console.log('  - 相同优先级时，黑桃 > 红桃 > 梅花 > 方块');
  console.log('  - 炒底者不能反成同一花色');
  console.log('  - 炒底成功者获得底牌，成为新庄家');
  console.log('  - 可以多次炒底\n');
  
  let chaoDiDeclaration = currentDeclaration;
  let currentDealer = DEALER;
  const chaoDiLog: string[] = [];
  
  // 所有人按顺序尝试炒底（用所有牌型）
  for (let round = 0; round < 3; round++) {
    console.log(`--- 炒底第 ${round + 1} 轮 ---\n`);
    let chaoDiHappened = false;
    
    for (const seat of seats) {
      if (seat === currentDealer) continue; // 当前庄家不能炒底
      
      const hand = seat === DEALER ? dealerHandAfterDiscard : hands[seats.indexOf(seat)];
      const allDeclarations = analyzeHandForTrump(hand, level, false); // 用所有牌型
      
      // 找可以炒底的
      for (const d of allDeclarations) {
        // 必须更大（考虑优先级和花色）
        if (compareDeclarations(d, chaoDiDeclaration) >= 0) continue;
        
        // 不能同一花色
        if (d.suit === chaoDiDeclaration.suit) continue;
        
        // 炒底成功
        chaoDiDeclaration = { ...d, declarer: seat };
        currentDealer = seat;
        chaoDiHappened = true;
        chaoDiLog.push(`🔥 ${seat} 炒底成功: ${d.desc} (${d.suit ? SUIT_NAMES[d.suit] + '主' : '无主'}，优先级${d.priority})`);
        console.log(`🔥 ${seat} 炒底成功!`);
        console.log(`   新主花色: ${d.suit ? SUIT_NAMES[d.suit] : '无主'}`);
        console.log(`   ${seat} 获得底牌: ${toDiscard.map(c => card(c)).join(' ')}`);
        console.log(`   新庄家: ${seat.toUpperCase()}\n`);
        break;
      }
      
      if (chaoDiHappened) break;
    }
    
    if (!chaoDiHappened) {
      console.log('无人能炒底\n');
      break;
    }
  }
  
  // 阶段6: 最终结果
  console.log('\n📦 阶段6: 最终结果\n');
  console.log(`✅ 最终庄家: ${currentDealer.toUpperCase()}`);
  console.log(`✅ 最终主花色: ${chaoDiDeclaration.suit ? SUIT_NAMES[chaoDiDeclaration.suit] : '无主'}`);
  console.log(`✅ 亮主牌型: ${chaoDiDeclaration.desc}\n`);
  
  const finalCtx: GameContext = { level, trumpSuit: chaoDiDeclaration.suit };
  
  console.log('所有玩家的最终手牌:\n');
  for (const seat of seats) {
    let finalHand: Card[];
    if (seat === currentDealer) {
      // 庄家有底牌
      if (currentDealer === DEALER) {
        finalHand = dealerHandAfterDiscard;
      } else {
        // 炒底者获得底牌
        finalHand = [...hands[seats.indexOf(seat)], ...toDiscard];
      }
    } else {
      finalHand = hands[seats.indexOf(seat)];
    }
    
    console.log(`${seat} (${finalHand.length}张)${seat === currentDealer ? ' 【庄家】' : ''}:`);
    console.log(`  ${displayHand(finalHand, finalCtx)}\n`);
  }
  
  console.log('\n✅ 测试完成\n');
}

testCorrectChaoDi();
