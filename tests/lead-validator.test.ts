// M3 测试：甩牌校验

import { describe, test, expect } from 'bun:test';
import { validateLeadPlay } from '../src/core/lead-validator';
import { parseCards } from '../src/core/parser';
import type { GameContext, Card } from '../src/core/types';

// 辅助函数
function card(suit: string, rank: string, id: number = 0): Card {
  return { id, suit: suit as any, rank: rank as any };
}

function jokerCard(type: 'big' | 'small', id: number = 0): Card {
  return { id, joker: type };
}

describe('M3: 甩牌校验', () => {
  
  describe('A. 非甩牌（单组件直接通过）', () => {
    test('A1: 单张♠K', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [card('spade', 'K', 0)];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
    
    test('A2: 对子♠KK', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
    
    test('A3: 拖拉机♠QQKK', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'K', 2), card('spade', 'K', 3)
      ];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
    
    test('A4: 三张♠KKK', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0),
        card('spade', 'K', 1),
        card('spade', 'K', 2)
      ];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
    
    test('A5: 超级拖拉机♠QQQKKK', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1), card('spade', 'Q', 2),
        card('spade', 'K', 3), card('spade', 'K', 4), card('spade', 'K', 5)
      ];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('B. 甩牌成功', () => {
    test('B1: ♠AA + ♠33（无人能压）', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'A', 0), card('spade', 'A', 1),
        card('spade', '3', 2), card('spade', '3', 3)
      ];
      // 对手没有♠牌
      const otherHands: Card[][] = [
        [card('heart', 'K', 10), card('heart', 'Q', 11)],
        [card('club', 'A', 12), card('club', 'K', 13)],
        [card('diamond', 'A', 14), card('diamond', 'K', 15)]
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
    
    test('B2: ♠AAA + ♠KK（无人能压）', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'A', 0), card('spade', 'A', 1), card('spade', 'A', 2),
        card('spade', 'K', 3), card('spade', 'K', 4)
      ];
      const otherHands: Card[][] = [
        [card('heart', 'K', 10)],
        [card('club', 'A', 11)],
        [card('diamond', 'A', 12)]
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('C. 甩牌失败 — 对子被压', () => {
    test('C1: ♠33+♠77 对手有♠88', () => {
      const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '7', 2), card('spade', '7', 3)
      ];
      const otherHands: Card[][] = [
        [card('spade', '8', 10), card('spade', '8', 11)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.failedComponent).toBeDefined();
      expect(result.failedComponent!.type).toBe('pair');
    });
    
    test('C2: ♠33+♠77 对手有♠8899拖拉机', () => {
      const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '7', 2), card('spade', '7', 3)
      ];
      const otherHands: Card[][] = [
        [card('spade', '8', 10), card('spade', '8', 11),
         card('spade', '9', 12), card('spade', '9', 13)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.failedComponent!.type).toBe('pair');
    });
    
    test('C3: ♠33+♠77 对手有♠888三张', () => {
      const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '7', 2), card('spade', '7', 3)
      ];
      const otherHands: Card[][] = [
        [card('spade', '8', 10), card('spade', '8', 11), card('spade', '8', 12)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.failedComponent!.type).toBe('pair');
    });
  });
  
  describe('D. 甩牌失败 — 单张被压', () => {
    test('D1: ♠KK + ♠3 对手有♠5', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0), card('spade', 'K', 1),
        card('spade', '3', 2)
      ];
      const otherHands: Card[][] = [
        [card('spade', '5', 10)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.failedComponent!.type).toBe('single');
    });
    
    test('D2: ♠AA + ♠3 对手有♠7', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'A', 0), card('spade', 'A', 1),
        card('spade', '3', 2)
      ];
      const otherHands: Card[][] = [
        [card('spade', '7', 10)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.failedComponent!.type).toBe('single');
    });
  });
  
  describe('E. 高阶隐含低阶压制', () => {
    test('E1: ♠33+♠77 对手有♠AAKK拖拉机', () => {
      const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '7', 2), card('spade', '7', 3)
      ];
      const otherHands: Card[][] = [
        [card('spade', 'A', 10), card('spade', 'A', 11),
         card('spade', 'K', 12), card('spade', 'K', 13)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
    });
    
    test('E2: ♠33+♠77 对手有♠AAA三张', () => {
      const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '7', 2), card('spade', '7', 3)
      ];
      const otherHands: Card[][] = [
        [card('spade', 'A', 10), card('spade', 'A', 11), card('spade', 'A', 12)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
    });
  });
  
  describe('F. 主牌甩牌', () => {
    test('F1: 主牌♥KK + ♥3 对手有♥A', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('heart', 'K', 0), card('heart', 'K', 1),
        card('heart', '3', 2)
      ];
      const otherHands: Card[][] = [
        [card('heart', 'A', 10)],
        [],
        []
      ];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
    });
    
    test('F2: 主牌♥AA + 大王 对手无更大', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('heart', 'A', 0), card('heart', 'A', 1),
        jokerCard('big', 2)
      ];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('G. 不同门牌不能甩', () => {
    test('G1: ♠KK + ♥33 非法', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0), card('spade', 'K', 1),
        card('heart', '3', 2), card('heart', '3', 3)
      ];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('同门');
    });
    
    test('G2: ♠KK + 大王 非法', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0), card('spade', 'K', 1),
        jokerCard('big', 2)
      ];
      const otherHands: Card[][] = [[], [], []];
      
      const result = validateLeadPlay(cards, otherHands, ctx);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('同门');
    });
  });

  describe('H. 回归：真实对局场景', () => {
    test('H1: 第8轮西家甩♦6644A应失败（北家有隐藏♦8899拖拉机）', () => {
      const ctx: GameContext = { level: '5', trumpSuit: null };

      const leadCards = [
        card('diamond', '6', 1001), card('diamond', '6', 1002),
        card('diamond', '4', 1003), card('diamond', '4', 1004),
        card('diamond', 'A', 1005)
      ];

      const eastHand: Card[] = [
        card('spade', '5', 1), card('heart', '5', 2), card('club', '5', 3), card('diamond', '5', 4),
        card('spade', 'A', 5), card('spade', 'Q', 6), card('spade', 'J', 7), card('spade', '8', 8),
        card('diamond', '9', 9), card('diamond', '7', 10), card('diamond', '4', 11)
      ];

      const northHand: Card[] = [
        jokerCard('big', 21), jokerCard('small', 22),
        card('spade', '5', 23), card('heart', '5', 24),
        card('diamond', 'K', 25), card('diamond', '9', 26), card('diamond', '9', 27),
        card('diamond', '8', 28), card('diamond', '8', 29), card('diamond', '8', 30)
      ];

      const southHand: Card[] = [
        jokerCard('big', 41), card('heart', '5', 42), card('diamond', '5', 43), card('diamond', '5', 44),
        card('heart', 'K', 45),
        card('diamond', 'K', 46), card('diamond', 'Q', 47), card('diamond', '10', 48), card('diamond', '7', 49), card('diamond', '7', 50)
      ];

      const result = validateLeadPlay(leadCards, [southHand, eastHand, northHand], ctx);
      expect(result.valid).toBe(false);
      expect(result.failedComponent).toBeDefined();
      expect(result.failedComponent!.type).toBe('tractor');
    });
  });
});

console.log('✓ M3 测试完成');
