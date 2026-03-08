#!/usr/bin/env bun

// 测试抓牌阶段 - 第一局抢庄局（详细版，每轮显示）

import { createDeck, shuffle, sortHand, isTrump, getCardDisplayName, getSuitDisplayName } from './src/core/deck';
import type { Card, GameContext, Suit, Rank, Seat } from './src/core/types';
import { analyzeDeclaration, TRUMP_PRIORITY, declare, type TrumpDeclaration } from './src/core/trump-state';

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

// AI决定是否亮主
function aiDecideDeclaration(
  hand: Card[], 
  level: Rank, 
  currentTrump: TrumpDeclaration | null,
  seat: Seat
): TrumpDeclaration | null {
  const declarations = analyzeHandForTrump(hand, level);
  
  if (declarations.length === 0) {
    return null;
  }
  
  // 如果当前没有亮主，选择最优的
  if (!currentTrump) {
    return { ...declarations[0], declarer: seat };
  }
  
  // 如果有，需要更高优先级且不同花色才能反主
  const best = declarations[0];
  if (best.priority < currentTrump.priority && best.suit !== currentTrump.suit) {
    return { ...best, declarer: seat };
  }
  
  return null;
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

// 主测试函数
function testDeal() {
  console.log('\n🎴 第一局抢庄局 - 抓牌阶段测试（AI亮主）\n');
  console.log('================================================================================');
  console.log('📦 抓牌过程（每轮显示当前手牌和可亮的主）：');
  console.log('================================================================================\n');
  
  // 创建并洗牌
  const deck = shuffle(createDeck());
  const hands: Card[][] = [[], [], [], []];
  const seats = ['east', 'north', 'west', 'south'];
  
  let currentTrump: TrumpDeclaration | null = null;
  let declarer: string | null = null;
  
  // 抓牌（39轮）
  for (let round = 1; round <= 39; round++) {
    console.log(`================================================================================`);
    console.log(`第 ${round} 轮抓牌 (共39轮)`);
    console.log(`================================================================================`);
    
    // 本轮抓的牌
    const roundCards: Card[] = [];
    for (let i = 0; i < 4; i++) {
      const card = deck[(round - 1) * 4 + i];
      hands[i].push(card);
      roundCards.push(card);
    }
    
    // 显示本轮抓的牌
    for (let i = 0; i < 4; i++) {
      console.log(`  ${seats[i]}: ${getCardName(roundCards[i])}`);
    }
    
    console.log('\n  当前手牌和可亮的主：');
    console.log('  ----------------------------------------------------------------------------');
    
    // 每个人检查是否亮主
    for (let i = 0; i < 4; i++) {
      const hand = hands[i];
      const seat = seats[i];
      
      // 统计关键牌
      const bigJokerCount = hand.filter(c => c.joker === 'big').length;
      const smallJokerCount = hand.filter(c => c.joker === 'small').length;
      const spade2Count = hand.filter(c => c.suit === 'spade' && c.rank === '2').length;
      const heart2Count = hand.filter(c => c.suit === 'heart' && c.rank === '2').length;
      const club2Count = hand.filter(c => c.suit === 'club' && c.rank === '2').length;
      const diamond2Count = hand.filter(c => c.suit === 'diamond' && c.rank === '2').length;
      
      console.log(`\n  ${seat} (${hand.length}张):`);
      console.log(`    手牌: 大王${bigJokerCount}张 小王${smallJokerCount}张 黑桃2:${spade2Count}张 红桃2:${heart2Count}张 梅花2:${club2Count}张 方块2:${diamond2Count}张`);
      
      // 显示可以亮的主
      const declarations = analyzeHandForTrump(hand, '2');
      
      if (declarations.length > 0) {
        const decStr = declarations.map(d => `${d.desc} (${getSuitName(d.suit)}主，优先级${d.priority})`).join(', ');
        console.log(`    可亮的主: ${decStr}`);
        
        // AI决定是否亮主
        const decision = aiDecideDeclaration(hand, '2', currentTrump, seat as Seat);
        if (decision) {
          currentTrump = decision;
          declarer = seat;
          console.log(`    📣 AI决定亮主: ${decision.desc} (${getSuitName(decision.suit)}主，优先级${decision.priority})`);
        }
      } else {
        console.log(`    可亮的主: (无)`);
      }
    }
  }
  
  // 底牌
  const kitty = deck.slice(156);
  
  console.log('\n================================================================================\n');
  console.log('📦 底牌 (6张):');
  console.log(`  ${kitty.map(c => getCardName(c)).join(' ')}`);
  
  // 最终亮主结果
  console.log('\n================================================================================');
  console.log('🎯 最终亮主结果');
  console.log('================================================================================\n');
  
  if (currentTrump && declarer) {
    console.log(`  ✅ ${declarer} 亮主成功！`);
    console.log(`  主花色: ${getSuitName(currentTrump.suit)}`);
    console.log(`  牌型: ${getTrumpTypeName(currentTrump)}`);
    console.log(`  亮主牌: ${currentTrump.cards.map(c => getCardName(c)).join(' ')}`);
    console.log(`  优先级: ${currentTrump.priority}`);
    
    // 创建游戏上下文
    const ctx: GameContext = {
      level: '2',
      trumpSuit: currentTrump.suit
    };
    
    // 显示最终手牌
    console.log('\n================================================================================');
    console.log('最终手牌（完整显示）');
    console.log('================================================================================\n');
    
    for (let i = 0; i < 4; i++) {
      const hand = hands[i];
      
      console.log(`\n${seats[i]} 的手牌 (${hand.length}张):`);
      console.log(displayHand(hand, ctx));
      
      // 显示可以亮的主
      const declarations = analyzeHandForTrump(hand, '2');
      
      if (declarations.length > 0) {
        console.log('\n  可以亮的主（按优先级排序）：');
        for (const d of declarations) {
          console.log(`    ✓ ${d.desc} (${getSuitName(d.suit)}主，优先级${d.priority})`);
        }
      }
    }
  } else {
    console.log(`  ❌ 无人亮主，将翻底牌决定主花色`);
  }
  
  console.log('\n================================================================================\n');
  console.log('✅ 抓牌阶段完成\n');
}

// 运行测试
testDeal();
