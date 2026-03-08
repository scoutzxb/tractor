#!/usr/bin/env bun

// 测试亮主和炒底 - 使用核心引擎验证

import {
  createTrumpState,
  canDeclare,
  declare,
  canChaoDi,
  chaoDi,
  flipKitty,
  createGameContext
} from './src/core/trump-state';
import { createDeck, shuffle, deal } from './src/core/deck';
import { sortHand } from './src/core/deck';
import type { Card, Seat, Rank, Suit, TrumpDeclaration } from './src/core/types';
import { smartDiscardKitty } from './smart-discard';

const SUIT_NAMES: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦'
};

const LEVEL: Rank = '2';
const DEALER: Seat = 'east';

console.log('\n🎴 亮主和炒底测试 - 使用核心引擎验证\n');

// 创建并发牌
const deck = shuffle(createDeck());
const { hands, kitty } = deal(deck);

console.log('📦 阶段1: 抓牌完成\n');

// 创建亮主状态机
let state = createTrumpState();

// 显示每个玩家的手牌和亮主能力
const seats: Seat[] = ['east', 'north', 'west', 'south'];
for (const seat of seats) {
  const hand = hands[seats.indexOf(seat)];
  console.log(`${seat} ${seat === DEALER ? '【庄家】' : ''} (${hand.length}张)`);
  
  // 统计级牌和王
  const bigJokers = hand.filter(c => c.joker === 'big').length;
  const smallJokers = hand.filter(c => c.joker === 'small').length;
  const levelCounts = new Map<Suit, number>();
  
  for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
    const count = hand.filter(c => c.suit === suit && c.rank === LEVEL).length;
    if (count > 0) levelCounts.set(suit, count);
  }
  
  console.log(`  大王${bigJokers}张 小王${smallJokers}张`);
  for (const [suit, count] of levelCounts) {
    console.log(`  ${SUIT_NAMES[suit]}${LEVEL}: ${count}张`);
  }
  console.log();
}

console.log('📦 阶段2: 初始亮主阶段（只用单张级牌）\n');
console.log('规则: 一旦有人亮主，其他人不能再亮主（直到炒底阶段）\n');

// 阶段2：初始亮主（按座位顺序，只用单张级牌）
let declarationMade = false;

for (const seat of seats) {
  if (declarationMade) break;
  
  const hand = hands[seats.indexOf(seat)];
  
  // 找单张级牌
  for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
    const cards = hand.filter(c => c.suit === suit && c.rank === LEVEL);
    if (cards.length >= 1) {
      const declarationCards = [cards[0]];
      
      // 使用核心引擎验证是否可以亮主
      if (canDeclare(state, seat, declarationCards, LEVEL)) {
        console.log(`📣 ${seat} 尝试亮主: 单张${SUIT_NAMES[suit]}${LEVEL}`);
        
        // 执行亮主
        state = declare(state, seat, declarationCards, LEVEL, DEALER);
        declarationMade = true;
        
        const trumpSuit = state.currentTrump?.suit;
        console.log(`✅ 亮主成功！主花色: ${trumpSuit ? SUIT_NAMES[trumpSuit] : '无主'}\n`);
        break;
      } else {
        console.log(`❌ ${seat} 不能亮 ${SUIT_NAMES[suit]}${LEVEL}（验证失败）`);
      }
    }
  }
}

if (!declarationMade) {
  console.log('无人亮主，翻底牌决定主花色\n');
  state = flipKitty(state, kitty, LEVEL, DEALER);
  const trumpSuit = state.currentTrump?.suit;
  console.log(`底牌决定主花色: ${trumpSuit ? SUIT_NAMES[trumpSuit] : '无主'}\n`);
}

console.log('📦 阶段3: 庄家获得底牌\n');
console.log(`${DEALER} 获得底牌: ${kitty.map(c => 
  c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
).join(' ')}\n`);

// 庄家手牌增加底牌
hands[seats.indexOf(DEALER)].push(...kitty);

console.log('📦 阶段4: 庄家扣底牌\n');
console.log(`${DEALER} 需要扣掉6张牌...\n`);

// 简化：庄家随机扣6张牌
const toDiscard = hands[seats.indexOf(DEALER)].slice(0, 6);
hands[seats.indexOf(DEALER)] = hands[seats.indexOf(DEALER)].slice(6);
console.log(`${DEALER} 扣底牌: ${toDiscard.map(c => 
  c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
).join(' ')}\n`);

console.log('📦 阶段5: 炒底阶段\n');
console.log('规则: 使用核心引擎验证每个炒底动作\n');

// 炒底阶段：每个人尝试用更强的牌炒底
let chaoDiRound = 1;
let maxRounds = 5;

while (chaoDiRound <= maxRounds) {
  console.log(`--- 炒底第 ${chaoDiRound} 轮 ---\n`);
  let chaoDiHappened = false;
  
  for (const seat of seats) {
    const hand = hands[seats.indexOf(seat)];
    
    // 尝试用各种牌型炒底（一对、三张等）
    const declarations = [
      { type: 'pair_joker_big', cards: hand.filter(c => c.joker === 'big').slice(0, 2), priority: 4, suit: null },
      { type: 'pair_joker_small', cards: hand.filter(c => c.joker === 'small').slice(0, 2), priority: 5, suit: null },
      { type: 'pair_level', cards: null, priority: 6, suit: null },
      { type: 'triple_level', cards: null, priority: 3, suit: null }
    ];
    
    // 尝试找一对级牌
    for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
      const cards = hand.filter(c => c.suit === suit && c.rank === LEVEL);
      if (cards.length >= 2) {
        declarations.push({
          type: 'pair_level',
          cards: cards.slice(0, 2),
          priority: 6,
          suit
        });
      }
      if (cards.length >= 3) {
        declarations.push({
          type: 'triple_level',
          cards: cards.slice(0, 3),
          priority: 3,
          suit
        });
      }
    }
    
    // 按优先级排序（数字越小越强）
    declarations.sort((a, b) => a.priority - b.priority);
    
    // 尝试炒底
    for (const decl of declarations) {
      if (!decl.cards || decl.cards.length === 0) continue;
      
      // 使用核心引擎验证
      if (canChaoDi(state, seat, decl.cards, LEVEL)) {
        console.log(`🔥 ${seat} 尝试炒底: ${decl.cards.map(c => 
          c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
        ).join(' ')}`);
        
        // 执行炒底
        state = chaoDi(state, seat, decl.cards, LEVEL);
        // 执行炒底
        state = chaoDi(state, seat, decl.cards, LEVEL);
        
        // 获取底牌
        const kitty = state.kittyHolder === seat ? hands[seats.indexOf(seat)].slice(-6) : [];
        
        // 炒底者需要扣回6张牌
        const ctx2 = createGameContext(state, LEVEL);
        const currentHand = hands[seats.indexOf(seat)];
        const toDiscard = smartDiscardKitty([...currentHand, ...kitty], ctx2, 6);
        
        console.log(`   ${seat} 扣回的牌: ${toDiscard.map(c => 
          c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
        ).join(' ')}`);
        
        // 更新手牌
        const discardIds = new Set(toDiscard.map(c => c.id));
        hands[seats.indexOf(seat)] = [...currentHand, ...kitty].filter(c => !discardIds.has(c.id));
        
        chaoDiHappened = true;
        break;
      }
    }
    
    if (chaoDiHappened) break;
  }
  
  if (!chaoDiHappened) {
    console.log('无人能炒底\n');
    break;
  }
  
  chaoDiRound++;
}

console.log('📦 阶段6: 最终结果\n');

const finalTrump = state.currentTrump;
const finalSuit = finalTrump?.suit;

console.log(`✅ 最终庄家: ${DEALER.toUpperCase()} (庄家始终不变)`);
console.log(`✅ 最终主花色: ${finalSuit ? SUIT_NAMES[finalSuit] : '无主'}`);
console.log(`✅ 亮主牌型: ${finalTrump?.cards.map(c => 
  c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
).join(' ') || '无'}\n`);

console.log('所有玩家的最终手牌:\n');

import { sortHand } from './src/core/deck';

const ctx = createGameContext(LEVEL, state);
for (const seat of seats) {
  const hand = hands[seats.indexOf(seat)];
  const sortedHand = sortHand([...hand], ctx);
  console.log(`${seat} ${seat === DEALER ? '【庄家】' : ''} (${hand.length}张)`);
  
  // 按主牌、副牌分类显示
  const trumpCards = sortedHand.filter(c => {
    if (c.joker) return true;
    if (c.rank === LEVEL) return true;
    if (finalSuit && c.suit === finalSuit) return true;
    return false;
  });
  
  const suitCards = new Map<Suit, Card[]>();
  for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
    const cards = sortedHand.filter(c => 
      c.suit === suit && 
      c.rank !== LEVEL && 
      (!finalSuit || c.suit !== finalSuit)
    );
    if (cards.length > 0) suitCards.set(suit, cards);
  }
  
  if (trumpCards.length > 0) {
    console.log(`  【主牌】 ${trumpCards.map(c => 
      c.joker ? (c.joker === 'big' ? '大王' : '小王') : `${SUIT_NAMES[c.suit!]}${c.rank}`
    ).join(' ')}`);
  }
  
  for (const [suit, cards] of suitCards) {
    console.log(`  【${SUIT_NAMES[suit]}】 ${cards.map(c => `${SUIT_NAMES[c.suit!]}${c.rank}`).join(' ')}`);
  }
  console.log();
}

console.log('✅ 测试完成\n');
