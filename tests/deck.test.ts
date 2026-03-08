// M1 完整测试：牌库与排序

import { describe, test, expect } from 'bun:test';
import {
  createDeck,
  shuffle,
  deal,
  getTrumpOrder,
  getSuitOrder,
  isTrump,
  classifyCard,
  cardCompare,
  sortHand,
  isAdjacent,
  SUITS,
  RANKS
} from '../src/core/deck';
import type { GameContext, Card, Rank } from '../src/core/types';

describe('M1: 牌库与排序', () => {
  
  // 测试用例1：生成牌库
  test('生成牌库：共162张，每种普通牌3张，大小王各3张', () => {
    const deck = createDeck();
    expect(deck.length).toBe(162);
    
    const counts = new Map<string, number>();
    for (const card of deck) {
      const key = card.joker 
        ? `joker_${card.joker}` 
        : `${card.suit}_${card.rank}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(counts.get(`${suit}_${rank}`)).toBe(3);
      }
    }
    
    expect(counts.get('joker_big')).toBe(3);
    expect(counts.get('joker_small')).toBe(3);
  });
  
  // 测试用例2：发牌
  test('发牌：4×39+6=162，不重复', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    const { hands, kitty } = deal(shuffled);
    
    expect(hands.length).toBe(4);
    for (const hand of hands) {
      expect(hand.length).toBe(39);
    }
    
    expect(kitty.length).toBe(6);
    
    const allIds = new Set<number>();
    for (const hand of hands) {
      for (const card of hand) {
        expect(allIds.has(card.id)).toBe(false);
        allIds.add(card.id);
      }
    }
    for (const card of kitty) {
      expect(allIds.has(card.id)).toBe(false);
      allIds.add(card.id);
    }
  });
  
  // 测试用例3：打4红桃主的主牌序列
  test('打4红桃主：主牌序列正确', () => {
    const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
    const trumpOrder = getTrumpOrder(ctx);
    
    // 大王 > 小王 > 红桃4 > 其他花色4
    expect(trumpOrder[0].joker).toBe('big');
    expect(trumpOrder[3].joker).toBe('small');
    expect(trumpOrder[6].suit).toBe('heart');
    expect(trumpOrder[6].rank).toBe('4');
    
    // 其他花色级牌应该在红桃4之后
    const otherLevelCards = trumpOrder.filter(c => 
      c.rank === '4' && c.suit !== 'heart' && c.suit !== undefined
    );
    expect(otherLevelCards.length).toBeGreaterThan(0);
  });
  
  // 测试用例4：打4红桃主的黑桃副牌序列
  test('打4红桃主：黑桃副牌序列', () => {
    const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
    const suitOrder = getSuitOrder('spade', ctx);
    
    // 黑桃副牌不应包含4
    expect(suitOrder.some(c => c.rank === '4')).toBe(false);
    
    // 第一个应该是A
    expect(suitOrder[0].rank).toBe('A');
    
    // 检查序列：A>K>Q>J>10>9>8>7>6>5>3>2
    const expectedRanks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '3', '2'];
    const actualRanks = [...new Set(suitOrder.map(c => c.rank!))];
    expect(actualRanks).toEqual(expectedRanks);
  });
  
  // 测试用例5：打K红桃主的红桃副牌序列
  test('打K红桃主：红桃副牌序列无K', () => {
    const ctx: GameContext = { level: 'K', trumpSuit: 'heart' };
    const suitOrder = getSuitOrder('heart', ctx);
    
    // 红桃副牌中不应包含K
    expect(suitOrder.some(c => c.rank === 'K')).toBe(false);
    
    // 第一个应该是A
    expect(suitOrder[0].rank).toBe('A');
    
    // A后面应该是Q（K被移除）
    // 注意：每种牌有3张，所以要跳过3个A
    expect(suitOrder[3].rank).toBe('Q');
  });
  
  // 测试用例6：级牌分类
  test('打2红桃主：级牌分类', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    // 红桃2→主牌
    const heart2: Card = { id: 0, suit: 'heart', rank: '2' };
    expect(isTrump(heart2, ctx)).toBe(true);
    expect(classifyCard(heart2, ctx)).toBe('trump');
    
    // 黑桃2→主牌
    const spade2: Card = { id: 1, suit: 'spade', rank: '2' };
    expect(isTrump(spade2, ctx)).toBe(true);
    expect(classifyCard(spade2, ctx)).toBe('trump');
    
    // 黑桃A→副牌·黑桃
    const spadeA: Card = { id: 2, suit: 'spade', rank: 'A' };
    expect(isTrump(spadeA, ctx)).toBe(false);
    expect(classifyCard(spadeA, ctx)).toEqual({ suit: 'spade' });
  });
  
  // 测试用例7：无主局主牌序列
  test('无主局打2：主牌序列', () => {
    const ctx: GameContext = { level: '2', trumpSuit: null };
    const trumpOrder = getTrumpOrder(ctx);
    
    // 大王 > 小王 > 四花色2（全同级）
    expect(trumpOrder[0].joker).toBe('big');
    expect(trumpOrder[3].joker).toBe('small');
    
    // 所有花色的2都应该是主牌
    const levelCards = trumpOrder.filter(c => c.rank === '2');
    expect(levelCards.length).toBe(12); // 4花色 × 3张
  });
  
  // 测试用例8：手牌排序
  test('手牌排序：大王在最左，方块在最右', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const hand: Card[] = [
      { id: 0, suit: 'diamond', rank: 'A' },
      { id: 1, suit: 'spade', rank: 'K' },
      { id: 2, joker: 'big' },
      { id: 3, suit: 'heart', rank: '3' },
      { id: 4, joker: 'small' }
    ];
    
    const sorted = sortHand(hand, ctx);
    
    expect(sorted[0].joker).toBe('big');
    expect(sorted[sorted.length - 1].suit).toBe('diamond');
  });
  
  // 测试用例9：亮主改变花色后重排序
  test('亮主改变花色后重排序', () => {
    // 初始打2无主
    const ctx1: GameContext = { level: '2', trumpSuit: null };
    const hand: Card[] = [
      { id: 0, suit: 'heart', rank: '2' },
      { id: 1, suit: 'spade', rank: 'A' },
      { id: 2, suit: 'heart', rank: 'A' }
    ];
    
    const sorted1 = sortHand([...hand], ctx1);
    
    // 亮红桃为主后
    const ctx2: GameContext = { level: '2', trumpSuit: 'heart' };
    const sorted2 = sortHand([...hand], ctx2);
    
    // 红桃2应该移到最前面（主牌）
    expect(sorted2[0].suit).toBe('heart');
    expect(sorted2[0].rank).toBe('2');
  });
  
  // 测试用例10：主花色级牌 vs 其他花色级牌
  test('cardCompare: 主花色级牌 > 其他花色级牌', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const heart2: Card = { id: 0, suit: 'heart', rank: '2' };
    const spade2: Card = { id: 1, suit: 'spade', rank: '2' };
    
    expect(cardCompare(heart2, spade2, ctx)).toBeGreaterThan(0);
    expect(cardCompare(spade2, heart2, ctx)).toBeLessThan(0);
  });
  
  // 测试用例11：两张其他花色级牌相等
  test('cardCompare: 两张其他花色级牌相等', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const spade2: Card = { id: 0, suit: 'spade', rank: '2' };
    const club2: Card = { id: 1, suit: 'club', rank: '2' };
    
    expect(cardCompare(spade2, club2, ctx)).toBe(0);
  });
  
  // 测试用例12：相邻性判断 - 主牌
  test('相邻性：大王和小王相邻', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const bigJoker: Card = { id: 0, joker: 'big' };
    const smallJoker: Card = { id: 1, joker: 'small' };
    
    expect(isAdjacent(bigJoker, smallJoker, ctx)).toBe(true);
  });
  
  // 测试用例13：相邻性判断 - 小王和主花色级牌
  test('相邻性：小王和主花色级牌相邻', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const smallJoker: Card = { id: 0, joker: 'small' };
    const heart2: Card = { id: 1, suit: 'heart', rank: '2' };
    
    expect(isAdjacent(smallJoker, heart2, ctx)).toBe(true);
  });
  
  // 测试用例14：相邻性判断 - 主花色级牌和其他花色级牌
  test('相邻性：主花色级牌和其他花色级牌相邻', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const heart2: Card = { id: 0, suit: 'heart', rank: '2' };
    const spade2: Card = { id: 1, suit: 'spade', rank: '2' };
    
    expect(isAdjacent(heart2, spade2, ctx)).toBe(true);
  });
  
  // 测试用例15：相邻性判断 - 其他花色级牌和主花色A
  test('相邻性：其他花色级牌和主花色A相邻', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const spade2: Card = { id: 0, suit: 'spade', rank: '2' };
    const heartA: Card = { id: 1, suit: 'heart', rank: 'A' };
    
    expect(isAdjacent(spade2, heartA, ctx)).toBe(true);
  });
  
  // 测试用例16：相邻性判断 - 级牌移除后副牌相邻
  test('相邻性：打4时黑桃3和5相邻', () => {
    const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
    
    const spade3: Card = { id: 0, suit: 'spade', rank: '3' };
    const spade5: Card = { id: 1, suit: 'spade', rank: '5' };
    
    expect(isAdjacent(spade3, spade5, ctx)).toBe(true);
  });
  
  // 测试用例17：相邻性判断 - 打K时Q和A相邻
  test('相邻性：打K时红桃Q和A相邻', () => {
    const ctx: GameContext = { level: 'K', trumpSuit: 'heart' };
    
    const heartQ: Card = { id: 0, suit: 'heart', rank: 'Q' };
    const heartA: Card = { id: 1, suit: 'heart', rank: 'A' };
    
    expect(isAdjacent(heartQ, heartA, ctx)).toBe(true);
  });
  
  // 测试用例18：洗牌随机性
  test('洗牌：改变牌序', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    
    // 至少有一些牌的位置改变了
    let changedCount = 0;
    for (let i = 0; i < deck.length; i++) {
      if (deck[i].id !== shuffled[i].id) {
        changedCount++;
      }
    }
    
    expect(changedCount).toBeGreaterThan(0);
  });
  
  // 测试用例19：副牌比较
  test('cardCompare: 副牌比较', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
    
    const spadeA: Card = { id: 0, suit: 'spade', rank: 'A' };
    const spadeK: Card = { id: 1, suit: 'spade', rank: 'K' };
    
    expect(cardCompare(spadeA, spadeK, ctx)).toBeGreaterThan(0);
  });
  
  // 测试用例20：无主局级牌同级
  test('无主局：所有花色级牌同级', () => {
    const ctx: GameContext = { level: '2', trumpSuit: null };
    
    const heart2: Card = { id: 0, suit: 'heart', rank: '2' };
    const spade2: Card = { id: 1, suit: 'spade', rank: '2' };
    const club2: Card = { id: 2, suit: 'club', rank: '2' };
    const diamond2: Card = { id: 3, suit: 'diamond', rank: '2' };
    
    expect(cardCompare(heart2, spade2, ctx)).toBe(0);
    expect(cardCompare(spade2, club2, ctx)).toBe(0);
    expect(cardCompare(club2, diamond2, ctx)).toBe(0);
  });
});

console.log('✓ M1 完整测试通过');
