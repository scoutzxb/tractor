#!/usr/bin/env bun

// 正确的炒底流程测试 - 最终修复版

import { createDeck, shuffle, deal, sortHand, isTrump, classifyCard, getCardDisplayName } from './src/core/deck';
import type { Card, Suit, Rank, Seat } from './src/core/types';

const SUIT_NAMES: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦'
};

const SUIT_PRIORITY: Suit[] = ['spade', 'heart', 'club', 'diamond']; // 花色优先级

// 优先级常量（数字越小优先级越高）
const TRUMP_PRIORITY = {
  THREE_BIG_JOKER: 1,
  THREE_SMALL_JOKER: 2,
  THREE_SAME_SUIT: 3,
  PAIR_BIG_JOKER: 4,
  PAIR_SMALL_JOKER: 5,
  PAIR_SAME_SUIT: 6,
  SINGLE_SUIT: 7
};

const DEALER: Seat = 'east'; // 固定庄家为east
const LEVEL: Rank = '2';

function card(c: Card): string {
  return getCardDisplayName(c);
}

// 分析手牌中的亮主机会
function analyzeHandForTrump(hand: Card[], level: Rank, singleOnly: boolean): {priority: number, suit: Suit | null, cards: Card[], desc: string}[] {
  const results: {priority: number, suit: Suit | null, cards: Card[], desc: string}[] = [];
  
  // 统计王和级牌
  const bigJokers = hand.filter(c => c.joker === 'big');
  const smallJokers = hand.filter(c => c.joker === 'small');
  
  const levelCards = new Map<Suit, Card[]>();
  for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
    const cards = hand.filter(c => c.suit === suit && c.rank === level);
    if (cards.length > 0) {
      levelCards.set(suit, cards);
    }
  }
  
  if (!singleOnly) {
    // 一对大王
    if (bigJokers.length >= 2) {
      results.push({
        priority: TRUMP_PRIORITY.PAIR_BIG_JOKER,
        suit: null,
        cards: bigJokers.slice(0, 2),
        desc: '一对大王'
      });
    }
    
    // 一对小王
    if (smallJokers.length >= 2) {
      results.push({
        priority: TRUMP_PRIORITY.PAIR_SMALL_JOKER,
        suit: null,
        cards: smallJokers.slice(0, 2),
        desc: '一对小王'
      });
    }
    
    // 一对同花色级牌
    for (const [suit, cards] of levelCards) {
      if (cards.length >= 2) {
        results.push({
          priority: TRUMP_PRIORITY.PAIR_SAME_SUIT,
          suit,
          cards: cards.slice(0, 2),
          desc: `一对${SUIT_NAMES[suit]}${level}`
        });
      }
    }
  }
  
  // 单张级牌
  for (const [suit, cards] of levelCards) {
    results.push({
      priority: TRUMP_PRIORITY.SINGLE_SUIT,
      suit,
      cards: [cards[0]],
      desc: `单张${SUIT_NAMES[suit]}${level}`
    });
  }
  
  // 按优先级排序
  return results.sort((a, b) => a.priority - b.priority);
}

// 比较两个亮主声明（考虑优先级和花色）
function compareDeclarations(a: {priority: number, suit: Suit | null}, b: {priority: number, suit: Suit | null}): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority; // 优先级小的胜出
  }
  
  // 相同优先级，比较花色
  if (a.suit === null && b.suit === null) return 0; // 都是无主
  if (a.suit === null) return -1; // 无主优先级最低
  if (b.suit === null) return 1;
  
  const aIdx = SUIT_PRIORITY.indexOf(a.suit);
  const bIdx = SUIT_PRIORITY.indexOf(b.suit);
  return aIdx - bIdx; // 黑桃>红桃>梅花>方块
}

// AI扣底牌策略：保留大牌，扣掉小牌
function aiDiscardKitty(hand: Card[], level: Rank): {keep: Card[], discard: Card[]} {
  const ctx = { level, trumpSuit: null as Suit | null };
  const sorted = [...hand].sort((a, b) => {
    const aIsTrump = isTrump(a, ctx);
    const bIsTrump = isTrump(b, ctx);
    if (aIsTrump && !bIsTrump) return -1;
    if (!aIsTrump && bIsTrump) return 1;
    return 0;
  });
  
  // 扣掉最后的6张（最小的副牌）
  const discard = sorted.slice(-6);
  const keep = sorted.slice(0, -6);
  
  return { keep, discard };
}

// 显示手牌
function displayHand(hand: Card[], label: string, level: Rank, trumpSuit: Suit | null) {
  const ctx = { level, trumpSuit };
  const sorted = sortHand(hand, ctx);
  
  console.log(`\n${label} (${hand.length}张):`);
  
  // 按主牌、副牌分类
  const groups = new Map<string, Card[]>();
  for (const card of sorted) {
    const classInfo = classifyCard(card, ctx);
    const key = classInfo === 'trump' ? '主牌' : (classInfo as {suit: Suit}).suit;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(card);
  }
  
  const order = ['主牌', 'spade', 'heart', 'club', 'diamond'];
  for (const key of order) {
    const cards = groups.get(key);
    if (cards && cards.length > 0) {
      const label = key === '主牌' ? '主牌' : SUIT_NAMES[key as Suit];
      console.log(`  【${label}】 ${cards.map(c => card(c)).join(' ')}`);
    }
  }
}

async function testCorrectChaoDi() {
  console.log('\n🎴 正确的炒底流程测试 - 最终修复版');
  console.log('================================================================================\n');
  console.log('📌 庄家固定为: EAST');
  console.log('📌 初始亮主只用单张级牌（保留实力）');
  console.log('📌 炒底时才用一对、三张等更强牌型');
  console.log('📌 相同优先级时，黑桃 > 红桃 > 梅花 > 方块');
  console.log('📌 炒底是在庄家扣底牌后，其他人可以夺底');
  console.log('📌 炒底成功者需要扣回6张牌');
  console.log('📌 庄家始终保持不变\n');
  
  // 阶段1: 抓牌
  console.log('\n📦 阶段1: 抓牌完成\n');
  
  const deck = shuffle(createDeck());
  const { hands, kitty } = deal(deck);
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  
  console.log('所有玩家的手牌和亮主机会:\n');
  
  for (const seat of seats) {
    const hand = hands[seats.indexOf(seat)];
    const isDealer = seat === DEALER;
    
    // 统计
    const bigJokers = hand.filter(c => c.joker === 'big').length;
    const smallJokers = hand.filter(c => c.joker === 'small').length;
    const spadeLevel = hand.filter(c => c.suit === 'spade' && c.rank === LEVEL).length;
    const heartLevel = hand.filter(c => c.suit === 'heart' && c.rank === LEVEL).length;
    const clubLevel = hand.filter(c => c.suit === 'club' && c.rank === LEVEL).length;
    const diamondLevel = hand.filter(c => c.suit === 'diamond' && c.rank === LEVEL).length;
    
    console.log(`${seat} (${hand.length}张)${isDealer ? ' 【庄家】' : ''}:`);
    console.log(`  大王${bigJokers}张 小王${smallJokers}张 黑桃${LEVEL}:${spadeLevel}张 红桃${LEVEL}:${heartLevel}张 梅花${LEVEL}:${clubLevel}张 方块${LEVEL}:${diamondLevel}张`);
    
    const allDeclarations = analyzeHandForTrump(hand, LEVEL, false);
    const singleDeclarations = allDeclarations.filter(d => d.priority === TRUMP_PRIORITY.SINGLE_SUIT);
    const otherDeclarations = allDeclarations.filter(d => d.priority < TRUMP_PRIORITY.SINGLE_SUIT);
    
    if (allDeclarations.length > 0) {
      console.log('  所有可亮的主:');
      for (const d of otherDeclarations) {
        console.log(`    ○ ${d.desc} (${d.suit ? SUIT_NAMES[d.suit] + '主' : '无主'}，优先级${d.priority}) [炒底可用]`);
      }
      for (const d of singleDeclarations) {
        console.log(`    ✓ ${d.desc} (${d.suit ? SUIT_NAMES[d.suit] + '主' : '无主'}，优先级${d.priority}) [初始可用]`);
      }
    } else {
      console.log('  可亮的主: (无)');
    }
  }
  
  // 阶段2: 初始亮主（只用单张）
  console.log('\n📦 阶段2: 初始亮主阶段（只用单张级牌）\n');
  let currentDeclaration: any = null;
  // 阶段2: 抓牌过程中亮主（一旦有人亮主，立即停止）
  console.log('\n📦 阶段2: 抓牌过程中亮主\n');
  console.log('规则: 在抓牌过程中，第一个亮主的人确定主花色');
  console.log('      其他人不能再亮主（直到炒底阶段）\n');
  
  // 模拟抓牌过程
  for (let i = 0; i < 39; i++) {
    for (let j = 0; j < 4; j++) {
      const seat = seats[j];
      const hand = hands[j].slice(0, i + 1); // 当前抓到的牌
      
      // 检查是否有单张级牌
      const singleDeclarations = analyzeHandForTrump(hand, LEVEL, true);
      if (singleDeclarations.length > 0) {
        const best = singleDeclarations[0];
        
        // 第一个亮主的人
        currentDeclaration = { ...best, declarer: seat };
        console.log(`📣 抓牌第 ${i + 1} 轮: ${seat} 亮主: ${best.desc} (${best.suit ? SUIT_NAMES[best.suit] + '主' : '无主'}，优先级${best.priority})`);
        console.log('\n✅ 亮主完成，其他人不能再亮主\n');
        break;
      }
    }
    if (currentDeclaration) break;
  }
  
  if (!currentDeclaration) {
    console.log('\n无人亮主，翻底牌决定主花色');
    return;
  }
  
  console.log(`✅ 初始亮主完成: ${currentDeclaration.declarer} 亮出 ${currentDeclaration.desc}`);
  console.log(`   主花色: ${currentDeclaration.suit ? SUIT_NAMES[currentDeclaration.suit] : '无主'}`);
  console.log(`   庄家仍然是: ${DEALER.toUpperCase()}\n`);
  
  const dealerHand = hands[seats.indexOf(DEALER)];
  const dealerHandWithKitty = [...dealerHand, ...kitty];
  
  console.log(`庄家 ${DEALER} 获得底牌: ${kitty.map(c => card(c)).join(' ')}`);
  console.log(`\n${DEALER} 现在有 ${dealerHandWithKitty.length} 张牌\n`);
  
  // 阶段4: 庄家扣底牌
  console.log('\n📦 阶段4: 庄家扣底牌\n');
  console.log('庄家需要扣掉6张牌到底牌区...\n');
  
  const { keep: dealerHandAfterDiscard, discard: toDiscard } = aiDiscardKitty(dealerHandWithKitty, LEVEL);
  console.log(`${DEALER} 扣底牌: ${toDiscard.map(c => card(c)).join(' ')}`);
  console.log(`${DEALER} 扣底后剩余 ${dealerHandAfterDiscard.length} 张牌\n`);
  
  // 更新庄家的手牌
  hands[seats.indexOf(DEALER)] = dealerHandAfterDiscard;
  
  // 阶段5: 炒底阶段
  console.log('\n📦 阶段5: 炒底阶段（可以用一对、三张等更强牌型）\n');
  console.log('规则:');
  console.log('  - 其他人可以用更高优先级的牌亮主（一对、三张等）');
  console.log('  - 相同优先级时，黑桃 > 红桃 > 梅花 > 方块');
  console.log('  - 炒底者不能反成同一花色');
  console.log('  - 炒底成功者获得底牌，需要扣回6张牌');
  console.log('  - 庄家始终保持不变');
  console.log('  - 可以多次炒底\n');
  
  let currentKitty = [...toDiscard];
  let chaoDiDeclaration = currentDeclaration;
  let currentKittyHolder = DEALER;
  
  for (let round = 0; round < 3; round++) {
    console.log(`--- 炒底第 ${round + 1} 轮 ---\n`);
    let chaoDiHappened = false;
    
    for (const seat of seats) {
      // 第一轮炒底：庄家不能参与，后续轮次可以
      if (round === 0 && seat === DEALER) continue;
      if (seat === currentKittyHolder) continue;
      const hand = hands[seats.indexOf(seat)];
      const allDeclarations = analyzeHandForTrump(hand, LEVEL, false);
      
      for (const d of allDeclarations) {
        if (compareDeclarations(d, chaoDiDeclaration) >= 0) continue;
        if (d.suit === chaoDiDeclaration.suit) continue;
        
        chaoDiDeclaration = { ...d, declarer: seat };
        chaoDiHappened = true;
        
        console.log(`🔥 ${seat} 炒底成功!`);
        console.log(`   新主花色: ${d.suit ? SUIT_NAMES[d.suit] : '无主'}`);
        console.log(`   ${seat} 获得底牌: ${currentKitty.map(c => card(c)).join(' ')}`);
        console.log(`   庄家仍然是: ${DEALER.toUpperCase()}\n`);
        
        // 炒底者获得底牌
        const newHand = [...hand, ...currentKitty];
        
        // 需要扣回6张牌
        const { keep: newHandAfterDiscard, discard: newKitty } = aiDiscardKitty(newHand, LEVEL);
        
        console.log(`   ${seat} 扣回底牌: ${newKitty.map(c => card(c)).join(' ')}`);
        console.log(`   ${seat} 最终手牌: ${newHandAfterDiscard.length}张\n`);
        
        // 更新
        hands[seats.indexOf(seat)] = newHandAfterDiscard;
        currentKitty = newKitty;
        currentKittyHolder = seat;
        
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
  
  console.log(`✅ 最终庄家: ${DEALER.toUpperCase()} (庄家始终不变)`);
  console.log(`✅ 最终主花色: ${chaoDiDeclaration.suit ? SUIT_NAMES[chaoDiDeclaration.suit] : '无主'}`);
  console.log(`✅ 亮主牌型: ${chaoDiDeclaration.desc}\n`);
  
  console.log('所有玩家的最终手牌:');
  for (const seat of seats) {
    const hand = hands[seats.indexOf(seat)];
    const isDealer = seat === DEALER;
    displayHand(hand, `${seat}${isDealer ? ' 【庄家】' : ''}`, LEVEL, chaoDiDeclaration.suit);
  }
  
  console.log('\n✅ 测试完成\n');
}

// 运行测试
testCorrectChaoDi();
