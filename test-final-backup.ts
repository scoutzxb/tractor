#!/usr/bin/env bun

// 完整的亮主炒底测试 - 使用核心引擎管理所有状态

import {
  createDeck,
  shuffle,
  deal,
  sortHand,
  isTrump,
  SUIT_NAMES
} from './src/core/deck';
import {
  createTrumpState,
  declare,
  canChaoDi,
  chaoDi,
  flipKitty,
  createGameContext
} from './src/core/trump-state';
import { smartDiscardKitty } from './src/ai/smart-discard';
import type { Card, Seat, Rank, GameContext } from './src/core/types';

const LEVEL: Rank = '2';
const DEALER: Seat = 'east';
const seats: Seat[] = ['east', 'south', 'west', 'north'];

console.log('\n🎴 完整的亮主炒底测试\n');

// 阶段1：抓牌
const deck = shuffle(createDeck());
const { hands, kitty } = deal(deck);

console.log('📦 阶段1: 抓牌完成\n');
seats.forEach(seat => {
  const hand = hands[seats.indexOf(seat)];
  const jokerBig = hand.filter(c => c.joker === 'big').length;
  const jokerSmall = hand.filter(c => c.joker === 'small').length;
  const levelCards = hand.filter(c => c.rank === LEVEL);
  
  console.log(`${seat} ${seat === DEALER ? '【庄家】' : ''} (${hand.length}张)`);
  console.log(`  大王${jokerBig}张 小王${jokerSmall}张`);
  
  // 统计各花色级牌
  const levelBySuit = new Map<string, number>();
  for (const c of levelCards) {
    const key = SUIT_NAMES[c.suit!];
    levelBySuit.set(key, (levelBySuit.get(key) || 0) + 1);
  }
  levelBySuit.forEach((count, suit) => {
    console.log(`  ${suit}${LEVEL}: ${count}张`);
  });
  console.log();
});

// 初始化亮主状态（非抢庄模式）
let state = createTrumpState(false);
console.log('📦 阶段2: 初始亮主阶段\n');
console.log('规则: 庄家优先亮主，然后其他人按顺序亮主\n');

// 阶段2：初始亮主（使用核心引擎）
let declarationMade = false;
for (const seat of seats) {
  const hand = hands[seats.indexOf(seat)];
  
  // 找单张级牌
  const levelCards = hand.filter(c => c.rank === LEVEL && !c.joker);
  if (levelCards.length === 0) continue;
  
  // 找第一张单张级牌
  const card = levelCards[0];
  const cards = [card];
  
  // 使用核心引擎亮主
  try {
    state = declare(state, seat, cards, LEVEL, DEALER);
    declarationMade = true;
    console.log(`📣 ${seat} 亮主: 单张${SUIT_NAMES[card.suit!]}${LEVEL}`);
    console.log(`✅ 亮主成功！主花色: ${SUIT_NAMES[card.suit!]}\n`);
    break;
  } catch (e) {
    // 亮主失败，继续
  }
}

// 无人亮主，翻底牌
if (!declarationMade) {
  console.log('无人亮主，翻底牌决定主花色\n');
  state = flipKitty(state, kitty, LEVEL, DEALER);
}

// 阶段3：庄家获得底牌
console.log('📦 阶段3: 庄家获得底牌\n');
const dealerHand = hands[seats.indexOf(DEALER)];
dealerHand.push(...kitty);
console.log(`${DEALER} 获得底牌: ${kitty.map(c => 
  c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
).join(' ')}\n`);

// 阶段4：庄家扣底牌
console.log('📦 阶段4: 庄家扣底牌\n');
const ctx1 = createGameContext(LEVEL, state);
const toDiscard = smartDiscardKitty(dealerHand, ctx1, 6);
console.log(`${DEALER} 扣底牌: ${toDiscard.map(c => 
  c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
).join(' ')}\n`);

// 从手牌中移除扣掉的牌
const discardIds = new Set(toDiscard.map(c => c.id));
for (let i = dealerHand.length - 1; i >= 0; i--) {
  if (discardIds.has(dealerHand[i].id)) {
    dealerHand.splice(i, 1);
  }
}

// 阶段5：炒底
console.log('📦 阶段5: 炒底阶段\n');
console.log('规则: 炒底成功者获得底牌，需要扣回6张牌\n');

let chaoDiCount = 0;
const maxRounds = 3;
let lastChaoDiPlayer: Seat | null = null;

for (let round = 0; round < maxRounds; round++) {
  console.log(`--- 炒底第 ${round + 1} 轮 ---\n`);
  let chaoDiHappened = false;
  
  for (const seat of seats) {
    // 最后炒底的人不能再炒
    if (seat === lastChaoDiPlayer) continue;
    
    const hand = hands[seats.indexOf(seat)];
    
    // 找所有可能的炒底牌型
    const possibleChaos: Card[][] = [];
    
    const levelCards = hand.filter(c => c.rank === LEVEL && !c.joker);
    const levelBySuit = new Map<string, Card[]>();
    for (const c of levelCards) {
      const key = c.suit!;
      if (!levelBySuit.has(key)) levelBySuit.set(key, []);
      levelBySuit.get(key)!.push(c);
    }
    
    const bigJokers = hand.filter(c => c.joker === 'big');
    const smallJokers = hand.filter(c => c.joker === 'small');
    
    // 按优先级从高到低检查（三张 > 对子）
    // 三张大王
    if (bigJokers.length >= 3) possibleChaos.push(bigJokers.slice(0, 3));
    // 三张小王
    if (smallJokers.length >= 3) possibleChaos.push(smallJokers.slice(0, 3));
    // 三张同花色级牌
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 3) possibleChaos.push(cards.slice(0, 3));
    }
    // 一对大王
    if (bigJokers.length >= 2) possibleChaos.push(bigJokers.slice(0, 2));
    // 一对小王
    if (smallJokers.length >= 2) possibleChaos.push(smallJokers.slice(0, 2));
    // 一对级牌
    for (const [suit, cards] of levelBySuit) {
      if (cards.length >= 2) possibleChaos.push(cards.slice(0, 2));
    }
    
    // 尝试炒底（已按优先级排序，先试最强的）
    for (const cards of possibleChaos) {
      if (canChaoDi(state, seat, cards, LEVEL)) {
        // 炒底成功
        state = chaoDi(state, seat, cards, LEVEL);
        lastChaoDiPlayer = seat;
        chaoDiHappened = true;
        chaoDiCount++;
        
        let desc: string;
        if (cards.length === 3) {
          if (cards[0].joker === 'big') desc = '三张大王';
          else if (cards[0].joker === 'small') desc = '三张小王';
          else desc = `三张${SUIT_NAMES[cards[0].suit!]}${LEVEL}`;
        } else {
          if (cards[0].joker === 'big') desc = '一对大王';
          else if (cards[0].joker === 'small') desc = '一对小王';
          else desc = `一对${SUIT_NAMES[cards[0].suit!]}${LEVEL}`;
        }
        
        console.log(`🔥 ${seat} 炒底成功: ${desc}`);
        console.log(`   新主花色: ${state.currentTrump?.suit ? SUIT_NAMES[state.currentTrump.suit] : '无主'}`);
        
        // 炒底者获得底牌
        const chaoDiHand = hands[seats.indexOf(seat)];
        chaoDiHand.push(...toDiscard);
        console.log(`   ${seat} 获得底牌: ${toDiscard.map(c => 
          c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
        ).join(' ')}`);
        
        // 扣回6张牌
        const ctx2 = createGameContext(LEVEL, state);
        const toReturn = smartDiscardKitty(chaoDiHand, ctx2, 6);
        console.log(`   ${seat} 扣回的牌: ${toReturn.map(c => 
          c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
        ).join(' ')}`);
        
        // 从手牌中移除扣回的牌
        const returnIds = new Set(toReturn.map(c => c.id));
        for (let i = chaoDiHand.length - 1; i >= 0; i--) {
          if (returnIds.has(chaoDiHand[i].id)) {
            chaoDiHand.splice(i, 1);
          }
        }
        
        console.log();
        break;
      }
    }
    
    if (chaoDiHappened) break;
  }
  
  if (!chaoDiHappened) {
    console.log('无人能炒底\n');
    break;
  }
}

// 阶段6：最终结果
console.log('📦 阶段6: 最终结果\n');
console.log(`✅ 最终庄家: ${DEALER.toUpperCase()} (庄家始终不变)`);
console.log(`✅ 最终主花色: ${state.currentTrump?.suit ? SUIT_NAMES[state.currentTrump.suit] : '无主'}`);
if (state.currentTrump) {
  const desc = state.currentTrump.cards.map(c => 
    c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
  ).join(' ');
  console.log(`✅ 亮主牌型: ${desc}\n`);
}

// 显示所有玩家的最终手牌
console.log('所有玩家的最终手牌:\n');
const finalCtx = createGameContext(LEVEL, state);

for (const seat of seats) {
  const hand = hands[seats.indexOf(seat)];
  const sortedHand = sortHand(hand, finalCtx);
  
  console.log(`${seat} ${seat === DEALER ? '【庄家】' : ''} (${hand.length}张)`);
  
  // 分类显示：主牌、各花色副牌
  const trumpCards: Card[] = [];
  const suitCards = new Map<string, Card[]>();
  
  for (const card of sortedHand) {
    if (isTrump(card, finalCtx)) {
      trumpCards.push(card);
    } else {
      const suit = card.suit!;
      if (!suitCards.has(suit)) suitCards.set(suit, []);
      suitCards.get(suit)!.push(card);
    }
  }
  
  // 显示主牌
  if (trumpCards.length > 0) {
    console.log(`  【主牌】 ${trumpCards.map(c => 
      c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
    ).join(' ')}`);
  }
  
  // 显示各花色副牌（按黑桃、红桃、梅花、方块顺序）
  const suitOrder = ['spade', 'heart', 'club', 'diamond'];
  for (const suit of suitOrder) {
    const cards = suitCards.get(suit);
    if (cards && cards.length > 0) {
      console.log(`  【${SUIT_NAMES[suit]}】 ${cards.map(c => 
        `${SUIT_NAMES[c.suit!]}${c.rank}`
      ).join(' ')}`);
    }
  }
  console.log();
}

console.log('✅ 测试完成\n');
