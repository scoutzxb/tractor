#!/usr/bin/env bun

// 测试亮主和炒底策略 - 第一局抢庄局

import { createDeck, shuffle, sortHand, isTrump, getCardDisplayName, getSuitDisplayName } from './src/core/deck';
import type { Card, GameContext, Suit, Rank, Seat } from './src/core/types';
import { analyzeDeclaration, TRUMP_PRIORITY, declare, canDeclare, type TrumpDeclaration } from './src/core/trump-state';

// 座位顺序
const SEATS: Seat[] = ['east', 'north', 'west', 'south'];

// 获取牌的显示名称
function getCardName(card: Card): string {
  return getCardDisplayName(card);
}

// 获取花色名称
function getSuitName(suit: Suit | null): string {
  if (suit === null) return '无主';
  const names: Record<Suit, string> = {
    spade: '黑桃',
    heart: '红桃',
    club: '梅花',
    diamond: '方块'
  };
  return names[suit] || suit;
}

// 获取主牌类型名称
function getTrumpTypeName(declaration: TrumpDeclaration): string {
  const priorityNames: Record<number, string> = {
    [TRUMP_PRIORITY.THREE_BIG_JOKER]: '三个大王',
    [TRUMP_PRIORITY.THREE_SMALL_JOKER]: '三个小王',
    [TRUMP_PRIORITY.THREE_SAME_SUIT]: '三张同花色级牌',
    [TRUMP_PRIORITY.PAIR_BIG_JOKER]: '一对大王',
    [TRUMP_PRIORITY.PAIR_SMALL_JOKER]: '一对小王',
    [TRUMP_PRIORITY.PAIR_SAME_SUIT]: '一对同花色级牌',
    [TRUMP_PRIORITY.SINGLE_SUIT]: '单张级牌'
  };
  return priorityNames[declaration.priority] || '未知';
}

// 分析手牌可以亮的主
function analyzeHandForTrump(hand: Card[], level: Rank): Array<TrumpDeclaration> {
  const declarations: TrumpDeclaration[] = [];
  
  // 统计手牌
  const counts = new Map<string, Card[]>();
  for (const card of hand) {
    const key = card.joker ? (card.joker === 'big' ? 'JOKER_BIG' : 'JOKER_SMALL') : `${card.suit}_${card.rank}`;
    if (!counts.has(key)) {
      counts.set(key, []);
    }
    counts.get(key)!.push(card);
  }
  
  // 检查大王
  const bigJokers = counts.get('JOKER_BIG');
  if (bigJokers && bigJokers.length >= 2) {
    declarations.push({
      suit: null,
      priority: TRUMP_PRIORITY.PAIR_BIG_JOKER,
      cards: bigJokers.slice(0, 2),
      declarer: 'east' as Seat,
      level,
      desc: '一对大王'
    });
  }
  
  // 检查小王
  const smallJokers = counts.get('JOKER_SMALL');
  if (smallJokers && smallJokers.length >= 2) {
    declarations.push({
      suit: null,
      priority: TRUMP_PRIORITY.PAIR_SMALL_JOKER,
      cards: smallJokers.slice(0, 2),
      declarer: 'east' as Seat,
      level,
      desc: '一对小王'
    });
  }
  
  // 检查级牌
  const levelCards = new Map<Suit, Card[]>();
  for (const [key, cardList] of counts) {
    if (key.startsWith('spade_') || key.startsWith('heart_') || 
        key.startsWith('club_') || key.startsWith('diamond_')) {
      const suit = cardList[0].suit!;
      if (cardList[0].rank === level) {
        if (!levelCards.has(suit)) {
          levelCards.set(suit, []);
        }
        levelCards.get(suit)!.push(...cardList);
      }
    }
  }
  
  // 一对同花色级牌
  for (const [suit, cards] of levelCards) {
    if (cards.length >= 2) {
      declarations.push({
        suit,
        priority: TRUMP_PRIORITY.PAIR_SAME_SUIT,
        cards: cards.slice(0, 2),
        declarer: 'east' as Seat,
        level,
        desc: `一对${getSuitName(suit)}${level}`
      });
    }
  }
  
  // 单张级牌
  for (const [suit, cards] of levelCards) {
    if (cards.length >= 1) {
      declarations.push({
        suit,
        priority: TRUMP_PRIORITY.SINGLE_SUIT,
        cards: [cards[0]],
        declarer: 'east' as Seat,
        level,
        desc: `单张${getSuitName(suit)}${level}`
      });
    }
  }
  
  // 按优先级排序（数字越小优先级越高）
  return declarations.sort((a, b) => a.priority - b.priority);
}

// 显示手牌（按主牌、副牌分类）
function displayHand(hand: Card[], ctx: GameContext): string {
  const sorted = sortHand(hand, ctx);
  const groups: { label: string; cards: Card[] }[] = [];
  
  // 按门分组
  const trumpCards = sorted.filter(c => isTrump(c, ctx));
  
  if (trumpCards.length > 0) {
    groups.push({
      label: '【主牌】',
      cards: trumpCards
    });
  }
  
  // 按花色分组副牌
  for (const suit of ['spade', 'heart', 'club', 'diamond'] as Suit[]) {
    const suitCards = sorted.filter(c => {
      if (isTrump(c, ctx)) return false;
      return c.suit === suit;
    });
    
    if (suitCards.length > 0) {
      groups.push({
        label: `【${getSuitDisplayName(suit)}】`,
        cards: suitCards
      });
    }
  }
  
  return groups.map(g => `${g.label} ${g.cards.map(c => getCardDisplayName(c)).join(' ')}`).join('\n  ');
}

// 显示简要手牌统计
function displayHandSummary(hand: Card[], level: Rank): string {
  const bigJokerCount = hand.filter(c => c.joker === 'big').length;
  const smallJokerCount = hand.filter(c => c.joker === 'small').length;
  const spade2Count = hand.filter(c => c.suit === 'spade' && c.rank === level).length;
  const heart2Count = hand.filter(c => c.suit === 'heart' && c.rank === level).length;
  const club2Count = hand.filter(c => c.suit === 'club' && c.rank === level).length;
  const diamond2Count = hand.filter(c => c.suit === 'diamond' && c.rank === level).length;
  
  return `大王${bigJokerCount}张 小王${smallJokerCount}张 黑桃${level}:${spade2Count}张 红桃${level}:${heart2Count}张 梅花${level}:${club2Count}张 方块${level}:${diamond2Count}张`;
}

// 主测试函数
function testChaoDiStrategy() {
  console.log('\n🎴 第一局抢庄局 - 亮主和炒底策略测试\n');
  console.log('================================================================================\n');
  
  // 创建并洗牌
  const deck = shuffle(createDeck());
  const hands: Card[][] = [[], [], [], []];
  const seats = ['east', 'north', 'west', 'south'];
  
  let initialDeclarer: string | null = null;
  let initialDeclaration: TrumpDeclaration | null = null;
  
  // 抓牌阶段（只显示关键轮次）
  console.log('📦 阶段1: 抓牌阶段');
  console.log('--------------------------------------------------------------------------------\n');
  
  for (let round = 1; round <= 39; round++) {
    // 本轮抓的牌
    for (let i = 0; i < 4; i++) {
      const card = deck[(round - 1) * 4 + i];
      hands[i].push(card);
    }
    
    // 第1轮：显示所有人初始手牌
    if (round === 1) {
      console.log(`第 ${round} 轮抓牌 (初始牌):`);
      for (let i = 0; i < 4; i++) {
        console.log(`  ${seats[i]}: ${hands[i].map(c => getCardName(c)).join(' ')}`);
      }
      console.log('');
    }
    
    // 检查是否有人可以亮主（只记录第一次）
    for (let i = 0; i < 4; i++) {
      const hand = hands[i];
      const declarations = analyzeHandForTrump(hand, '2');
      
      if (declarations.length > 0 && !initialDeclarer) {
        // 第一次有人可以亮主
        initialDeclarer = seats[i];
        initialDeclaration = { ...declarations[0], declarer: seats[i] as Seat };
        
        console.log(`✋ 第 ${round} 轮: ${seats[i]} 可以首次亮主！`);
        console.log(`   可亮的主: ${declarations[0].desc} (${getSuitName(declarations[0].suit)}主，优先级${declarations[0].priority})`);
        console.log(`   当前手牌: ${displayHandSummary(hand, '2')}`);
        console.log('');
        
        // 只记录第一次，不实际亮主（等待炒底机会）
        break;
      }
    }
  }
  
  // 底牌
  const kitty = deck.slice(156);
  
  console.log('================================================================================\n');
  console.log('📦 阶段2: 底牌揭晓');
  console.log('--------------------------------------------------------------------------------\n');
  console.log(`底牌 (6张): ${kitty.map(c => getCardName(c)).join(' ')}\n`);
  
  // 显示每个人完整手牌和可亮的主
  console.log('================================================================================\n');
  console.log('📦 阶段3: 抓牌完成 - 所有人手牌和亮主机会');
  console.log('--------------------------------------------------------------------------------\n');
  
  for (let i = 0; i < 4; i++) {
    const hand = hands[i];
    const declarations = analyzeHandForTrump(hand, '2');
    
    console.log(`${seats[i]} 的手牌 (${hand.length}张):`);
    console.log(`  ${displayHandSummary(hand, '2')}`);
    
    if (declarations.length > 0) {
      console.log(`  可亮的主:`);
      for (const d of declarations) {
        console.log(`    ✓ ${d.desc} (${getSuitName(d.suit)}主，优先级${d.priority})`);
      }
    } else {
      console.log(`  可亮的主: (无)`);
    }
    console.log('');
  }
  
  // 初始亮主阶段
  console.log('================================================================================\n');
  console.log('📦 阶段4: 初始亮主阶段');
  console.log('--------------------------------------------------------------------------------\n');
  
  let currentDeclaration: TrumpDeclaration | null = null;
  let currentDeclarer: string | null = null;
  
  // 按座位顺序尝试亮主
  for (let i = 0; i < 4; i++) {
    const hand = hands[i];
    const declarations = analyzeHandForTrump(hand, '2');
    
    if (declarations.length > 0) {
      // 如果还没有人亮主，亮最优的
      if (!currentDeclaration) {
        currentDeclaration = { ...declarations[0], declarer: seats[i] as Seat };
        currentDeclarer = seats[i];
        console.log(`📣 ${seats[i]} 亮主: ${declarations[0].desc} (${getSuitName(declarations[0].suit)}主，优先级${declarations[0].priority})`);
      } else {
        // 如果已经有人亮主，检查是否可以反主
        const best = declarations[0];
        if (best.priority < currentDeclaration.priority && best.suit !== currentDeclaration.suit) {
          currentDeclaration = { ...best, declarer: seats[i] as Seat };
          currentDeclarer = seats[i];
          console.log(`📣 ${seats[i]} 反主: ${best.desc} (${getSuitName(best.suit)}主，优先级${best.priority})`);
        }
      }
    }
  }
  
  if (!currentDeclaration) {
    console.log('❌ 无人亮主，将翻底牌决定主花色\n');
  }
  
  // 庄家获得底牌
  console.log('================================================================================\n');
  console.log('📦 阶段5: 庄家获得底牌');
  console.log('--------------------------------------------------------------------------------\n');
  
  // 在第一局中，初始亮主者成为庄家
  const dealer = currentDeclarer || 'east'; // 如果无人亮主，east成为庄家
  const dealerIndex = seats.indexOf(dealer);
  
  console.log(`庄家: ${dealer}`);
  console.log(`底牌给庄家: ${kitty.map(c => getCardName(c)).join(' ')}\n`);
  
  // 庄家获得底牌
  hands[dealerIndex].push(...kitty);
  
  // 显示庄家获得底牌后的手牌
  console.log(`${dealer} 获得底牌后的手牌 (${hands[dealerIndex].length}张):`);
  console.log(`  ${displayHandSummary(hands[dealerIndex], '2')}`);
  
  const dealerDeclarations = analyzeHandForTrump(hands[dealerIndex], '2');
  if (dealerDeclarations.length > 0) {
    console.log(`  可亮的主:`);
    for (const d of dealerDeclarations) {
      console.log(`    ✓ ${d.desc} (${getSuitName(d.suit)}主，优先级${d.priority})`);
    }
  }
  console.log('');
  
  // 炒底阶段
  console.log('================================================================================\n');
  console.log('📦 阶段6: 炒底阶段（其他人可以亮主夺取底牌）');
  console.log('--------------------------------------------------------------------------------\n');
  
  console.log('炒底规则:');
  console.log('  - 炒底者必须有更高优先级的牌');
  console.log('  - 炒底者不能反成同一花色');
  console.log('  - 炒底者将获得底牌');
  console.log('  - 最后一次炒底成功者成为庄家\n');
  
  let chaoDiDeclaration = currentDeclaration;
  let chaoDiDeclarer = currentDeclarer;
  
  // 按座位顺序尝试炒底
  for (let i = 0; i < 4; i++) {
    if (seats[i] === dealer) continue; // 庄家不能炒自己的底
    
    const hand = hands[i];
    const declarations = analyzeHandForTrump(hand, '2');
    
    if (declarations.length > 0) {
      const best = declarations[0];
      
      // 检查是否可以炒底
      if (chaoDiDeclaration) {
        // 需要更高优先级且不同花色
        if (best.priority < chaoDiDeclaration.priority && best.suit !== chaoDiDeclaration.suit) {
          console.log(`🔥 ${seats[i]} 炒底: ${best.desc} (${getSuitName(best.suit)}主，优先级${best.priority})`);
          chaoDiDeclaration = { ...best, declarer: seats[i] as Seat };
          chaoDiDeclarer = seats[i];
        }
      } else {
        // 如果之前无人亮主，现在可以亮主
        console.log(`🔥 ${seats[i]} 炒底: ${best.desc} (${getSuitName(best.suit)}主，优先级${best.priority})`);
        chaoDiDeclaration = { ...best, declarer: seats[i] as Seat };
        chaoDiDeclarer = seats[i];
      }
    }
  }
  
  // 最终结果
  console.log('================================================================================\n');
  console.log('📦 最终结果');
  console.log('--------------------------------------------------------------------------------\n');
  
  if (chaoDiDeclarer && chaoDiDeclaration) {
    if (chaoDiDeclarer !== currentDeclarer) {
      console.log(`🎉 ${chaoDiDeclarer} 炒底成功！成为新庄家`);
    } else {
      console.log(`✅ ${chaoDiDeclarer} 亮主成功，成为庄家`);
    }
    
    console.log(`主花色: ${getSuitName(chaoDiDeclaration.suit)}`);
    console.log(`牌型: ${getTrumpTypeName(chaoDiDeclaration)}`);
    console.log(`亮主牌: ${chaoDiDeclaration.cards.map(c => getCardName(c)).join(' ')}`);
    console.log(`优先级: ${chaoDiDeclaration.priority}`);
    
    // 创建游戏上下文
    const ctx: GameContext = {
      level: '2',
      trumpSuit: chaoDiDeclaration.suit
    };
    
    // 显示最终手牌
    console.log('\n所有玩家的最终手牌:');
    for (let i = 0; i < 4; i++) {
      console.log(`\n${seats[i]} (${hands[i].length}张):`);
      console.log(displayHand(hands[i], ctx));
    }
  } else {
    console.log('❌ 无人亮主，将翻底牌决定主花色');
  }
  
  console.log('\n================================================================================\n');
  console.log('✅ 测试完成\n');
}

// 运行测试
testChaoDiStrategy();
