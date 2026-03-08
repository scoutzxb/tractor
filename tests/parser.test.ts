// M2 测试：牌型识别与解析

import { describe, test, expect } from 'bun:test';
import { parseCards, isSameSuit, getPlaySuit } from '../src/core/parser';
import { createCard } from '../src/core/deck';
import type { GameContext, Card } from '../src/core/types';

// 辅助函数：创建牌
function card(suit: string, rank: string, id: number = 0): Card {
  return { id, suit: suit as any, rank: rank as any };
}

function jokerCard(type: 'big' | 'small', id: number = 0): Card {
  return { id, joker: type };
}

describe('M2: 牌型识别与解析', () => {
  
  describe('A. 基础牌型', () => {
    test('A1: 单张K', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [card('spade', 'K', 0)];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('single');
      expect(result[0].cards).toHaveLength(1);
      expect(result[0].cards[0].rank).toBe('K');
    });
    
    test('A2: KK对子', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('pair');
      expect(result[0].cards).toHaveLength(2);
    });
    
    test('A3: KKK三张', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0),
        card('spade', 'K', 1),
        card('spade', 'K', 2)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('triple');
      expect(result[0].cards).toHaveLength(3);
    });
    
    test('A4: 打K红桃主时K是主牌', () => {
      const ctx: GameContext = { level: 'K', trumpSuit: 'heart' };
      const cards = [card('heart', 'K', 0)];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('single');
      expect(isSameSuit(cards, ctx)).toBe(true);
    });
    
    test('A5: 空输入', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const result = parseCards([], ctx);
      
      expect(result).toHaveLength(0);
    });
  });
  
  describe('B. 拖拉机基础', () => {
    test('B1: ♠QQKK', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'K', 2), card('spade', 'K', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('B2: ♠JJQQKK', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'J', 0), card('spade', 'J', 1),
        card('spade', 'Q', 2), card('spade', 'Q', 3),
        card('spade', 'K', 4), card('spade', 'K', 5)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(3);
    });
    
    test('B3: ♠JJQQKKAA', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'J', 0), card('spade', 'J', 1),
        card('spade', 'Q', 2), card('spade', 'Q', 3),
        card('spade', 'K', 4), card('spade', 'K', 5),
        card('spade', 'A', 6), card('spade', 'A', 7)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(4);
    });
    
    test('B4: ♠KKAA', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0), card('spade', 'K', 1),
        card('spade', 'A', 2), card('spade', 'A', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('B5: ♠AA22（打3♥主）', () => {
      const ctx: GameContext = { level: '3', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'A', 0), card('spade', 'A', 1),
        card('spade', '2', 2), card('spade', '2', 3)
      ];
      const result = parseCards(cards, ctx);
      
      // A和2不相邻
      expect(result).toHaveLength(2);
      expect(result.every(r => r.type === 'pair')).toBe(true);
    });
  });
  
  describe('C. 级牌移除后相邻', () => {
    test('C1: ♠3355（打4♥主）', () => {
      const ctx: GameContext = { level: '4', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '5', 2), card('spade', '5', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('C2: ♠4466（打5♥主）', () => {
      const ctx: GameContext = { level: '5', trumpSuit: 'heart' };
      const cards = [
        card('spade', '4', 0), card('spade', '4', 1),
        card('spade', '6', 2), card('spade', '6', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('C3: ♠QQAA（打K♥主）', () => {
      const ctx: GameContext = { level: 'K', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'A', 2), card('spade', 'A', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
  });
  
  describe('D. 主牌拖拉机', () => {
    test('D1: 大王×2 + 小王×2', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        jokerCard('big', 0), jokerCard('big', 1),
        jokerCard('small', 2), jokerCard('small', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('D2: 小王×2 + ♥22', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        jokerCard('small', 0), jokerCard('small', 1),
        card('heart', '2', 2), card('heart', '2', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('D3: ♥22 + ♠22', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('heart', '2', 0), card('heart', '2', 1),
        card('spade', '2', 2), card('spade', '2', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('D4: ♠22 + ♥AA', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', '2', 0), card('spade', '2', 1),
        card('heart', 'A', 2), card('heart', 'A', 3)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
  });
  
  describe('E. 超级拖拉机', () => {
    test('E1: ♠333444', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1), card('spade', '3', 2),
        card('spade', '4', 3), card('spade', '4', 4), card('spade', '4', 5)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('super_tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('E2: ♠333444555', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1), card('spade', '3', 2),
        card('spade', '4', 3), card('spade', '4', 4), card('spade', '4', 5),
        card('spade', '5', 6), card('spade', '5', 7), card('spade', '5', 8)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('super_tractor');
      expect(result[0].length).toBe(3);
    });
    
    test('E3: 大王×3 + 小王×3', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        jokerCard('big', 0), jokerCard('big', 1), jokerCard('big', 2),
        jokerCard('small', 3), jokerCard('small', 4), jokerCard('small', 5)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('super_tractor');
      expect(result[0].length).toBe(2);
    });
  });
  
  describe('F. 解析优先级冲突', () => {
    test('F1: ♠QQKKK（三张优先）', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'K', 2), card('spade', 'K', 3), card('spade', 'K', 4)
      ];
      const result = parseCards(cards, ctx);
      
      // 应该解析为triple KKK + pair QQ
      expect(result).toHaveLength(2);
      expect(result.find(r => r.type === 'triple')).toBeDefined();
      expect(result.find(r => r.type === 'pair')).toBeDefined();
    });
    
    test('F2: ♠QQQKK（三张优先）', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1), card('spade', 'Q', 2),
        card('spade', 'K', 3), card('spade', 'K', 4)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(2);
      expect(result.find(r => r.type === 'triple')).toBeDefined();
      expect(result.find(r => r.type === 'pair')).toBeDefined();
    });
    
    test('F3: ♠QQQKKK（超级拖拉机）', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1), card('spade', 'Q', 2),
        card('spade', 'K', 3), card('spade', 'K', 4), card('spade', 'K', 5)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('super_tractor');
      expect(result[0].length).toBe(2);
    });
    
    test('F4: ♠QQQKKKAA', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1), card('spade', 'Q', 2),
        card('spade', 'K', 3), card('spade', 'K', 4), card('spade', 'K', 5),
        card('spade', 'A', 6), card('spade', 'A', 7)
      ];
      const result = parseCards(cards, ctx);
      
      // 超级拖拉机QQQKKK + pair AA
      expect(result).toHaveLength(2);
      expect(result.find(r => r.type === 'super_tractor')).toBeDefined();
      expect(result.find(r => r.type === 'pair')).toBeDefined();
    });
  });
  
  describe('G. 甩牌混合组合', () => {
    test('G1: ♠KK + ♠A', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0), card('spade', 'K', 1),
        card('spade', 'A', 2)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(2);
      expect(result.find(r => r.type === 'pair')).toBeDefined();
      expect(result.find(r => r.type === 'single')).toBeDefined();
    });
    
    test('G2: ♠KKK + ♠QQ + ♠J', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'K', 0), card('spade', 'K', 1), card('spade', 'K', 2),
        card('spade', 'Q', 3), card('spade', 'Q', 4),
        card('spade', 'J', 5)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(3);
      expect(result.filter(r => r.type === 'triple')).toHaveLength(1);
      expect(result.filter(r => r.type === 'pair')).toHaveLength(1);
      expect(result.filter(r => r.type === 'single')).toHaveLength(1);
    });
    
    test('G3: ♠JJQQ + ♠A', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'J', 0), card('spade', 'J', 1),
        card('spade', 'Q', 2), card('spade', 'Q', 3),
        card('spade', 'A', 4)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(2);
      expect(result.find(r => r.type === 'tractor')).toBeDefined();
      expect(result.find(r => r.type === 'single')).toBeDefined();
    });
    
    test('G4: ♠333444 + ♠KK + ♠A', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', '3', 0), card('spade', '3', 1), card('spade', '3', 2),
        card('spade', '4', 3), card('spade', '4', 4), card('spade', '4', 5),
        card('spade', 'K', 6), card('spade', 'K', 7),
        card('spade', 'A', 8)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(3);
      expect(result.find(r => r.type === 'super_tractor')).toBeDefined();
      expect(result.find(r => r.type === 'pair')).toBeDefined();
      expect(result.find(r => r.type === 'single')).toBeDefined();
    });
  });
  
  describe('H. 边界与特殊情况', () => {
    test('H1: 同一张牌3张', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'A', 0),
        card('spade', 'A', 1),
        card('spade', 'A', 2)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('triple');
    });
    
    test('H2: ♠AAKKQQJJ1010', () => {
      const ctx: GameContext = { level: '2', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'A', 0), card('spade', 'A', 1),
        card('spade', 'K', 2), card('spade', 'K', 3),
        card('spade', 'Q', 4), card('spade', 'Q', 5),
        card('spade', 'J', 6), card('spade', 'J', 7),
        card('spade', '10', 8), card('spade', '10', 9)
      ];
      const result = parseCards(cards, ctx);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(5);
    });
    
    test('H3: 无主局♠22+♥22', () => {
      const ctx: GameContext = { level: '2', trumpSuit: null };
      const cards = [
        card('spade', '2', 0), card('spade', '2', 1),
        card('heart', '2', 2), card('heart', '2', 3)
      ];
      const result = parseCards(cards, ctx);
      
      // 无主局所有级牌同级，不构成拖拉机
      expect(result).toHaveLength(2);
      expect(result.every(r => r.type === 'pair')).toBe(true);
    });
    
    test('H4: 打A♥主♠QQKK', () => {
      const ctx: GameContext = { level: 'A', trumpSuit: 'heart' };
      const cards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'K', 2), card('spade', 'K', 3)
      ];
      const result = parseCards(cards, ctx);
      
      // A移除后Q和K仍相邻
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tractor');
      expect(result[0].length).toBe(2);
    });
  });
});

console.log('✓ M2 测试完成');
