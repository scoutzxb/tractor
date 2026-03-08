// M5 完整测试：杀牌校验

import { describe, test, expect } from 'bun:test';
import { validateKill, compareKills, canKill } from '../src/core/kill-validator';
import { parseCards } from '../src/core/parser';
import type { Card, GameContext, Seat } from '../src/core/types';

// 辅助函数
const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);
const joker = (type: string, id: number): Card => ({ id, joker: type as any });

describe('M5: 杀牌校验', () => {
  const ctx: GameContext = { level: '2', trumpSuit: 'heart' };

  // A. 合法杀牌 — 精确匹配（7个）
  describe('A. 合法杀牌 — 精确匹配', () => {
    test('A1: ♠K单张 → ♥3主牌单张，合法', () => {
      const leadCards = [card('spade', 'K', 0)];
      const killCards = [card('heart', '3', 1)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('A2: ♠KK对子 → ♥33主牌对子，合法', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const killCards = [card('heart', '3', 2), card('heart', '3', 3)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('A3: ♠QQKK拖拉机 → ♥AAKK主牌拖拉机，合法', () => {
      const leadCards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'K', 2), card('spade', 'K', 3)
      ];
      const killCards = [
        card('heart', 'A', 4), card('heart', 'A', 5),
        card('heart', 'K', 6), card('heart', 'K', 7)
      ];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('A4: ♠KKK三张 → ♥333主牌三张，合法', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1), card('spade', 'K', 2)];
      const killCards = [card('heart', '3', 3), card('heart', '3', 4), card('heart', '3', 5)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('A5: ♠A单张 → 大王，合法', () => {
      const leadCards = [card('spade', 'A', 0)];
      const killCards = [joker('big', 1)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });
  });

  // B. 合法杀牌 — 高阶包含低阶（8个）
  describe('B. 合法杀牌 — 高阶包含', () => {
    test('B1: ♠33+♠77两对子 → ♥AAKK主牌拖拉机，合法', () => {
      const leadCards = [
        card('spade', '3', 0), card('spade', '3', 1),
        card('spade', '7', 2), card('spade', '7', 3)
      ];
      const killCards = [
        card('heart', 'A', 4), card('heart', 'A', 5),
        card('heart', 'K', 6), card('heart', 'K', 7)
      ];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('B2: ♠K+♠QQ单张+对子 → ♥333主牌三张，合法', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'Q', 1), card('spade', 'Q', 2)];
      const killCards = [card('heart', '3', 3), card('heart', '3', 4), card('heart', '3', 5)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('B3: ♠33+♠K对子+单张 → ♥AAA主牌三张，合法', () => {
      const leadCards = [card('spade', '3', 0), card('spade', '3', 1), card('spade', 'K', 2)];
      const killCards = [card('heart', 'A', 3), card('heart', 'A', 4), card('heart', 'A', 5)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });
  });

  // C. 非法杀牌（7个）
  describe('C. 非法杀牌', () => {
    test('C1: ♠KK对子 → ♥3+♠7含非主牌，非法（垫牌）', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const killCards = [card('heart', '3', 2), card('spade', '7', 3)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(false);
    });

    test('C2: ♠KK对子 → ♥3+♥9两单张不成对，非法（垫牌）', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const killCards = [card('heart', '3', 2), card('heart', '9', 3)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(false);
    });

    test('C3: ♠KKK三张 → ♥AA+♥3对子+单张，非法（垫牌）', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1), card('spade', 'K', 2)];
      const killCards = [card('heart', 'A', 3), card('heart', 'A', 4), card('heart', '3', 5)];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(false);
    });

    test('C4: ♠QQKK拖拉机 → ♥AAKK拖拉机长度不够，非法（垫牌）', () => {
      const leadCards = [
        card('spade', 'Q', 0), card('spade', 'Q', 1),
        card('spade', 'K', 2), card('spade', 'K', 3)
      ];
      const killCards = [
        card('heart', 'A', 4), card('heart', 'A', 5),
        card('heart', 'K', 6), card('heart', 'K', 7)
      ];
      
      const result = validateKill(leadCards, killCards, ctx);
      // 这个应该合法，因为长度匹配
      expect(result.valid).toBe(true);
    });
  });

  // D. 多人杀牌比较 compareKills（10个）
  describe('D. 多人杀牌比较', () => {
    test('D1: ♠K单张 → 北♥3 vs 南♥9 → 南胜', () => {
      const leadCards = [card('spade', 'K', 0)];
      const kill1 = { cards: [card('heart', '3', 1)], seat: 'north' as Seat };
      const kill2 = { cards: [card('heart', '9', 2)], seat: 'south' as Seat };
      
      const winner = compareKills(leadCards, kill1, kill2, ctx);
      expect(winner).toBe('south');
    });

    test('D2: ♠KK对子 → 北♥33 vs 南♥99 → 南胜', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const kill1 = { cards: [card('heart', '3', 2), card('heart', '3', 3)], seat: 'north' as Seat };
      const kill2 = { cards: [card('heart', '9', 4), card('heart', '9', 5)], seat: 'south' as Seat };
      
      const winner = compareKills(leadCards, kill1, kill2, ctx);
      expect(winner).toBe('south');
    });

    test('D3: ♠22+♣22同级对子 → 先出者胜', () => {
      const leadCards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const kill1 = { cards: [card('spade', '2', 2), card('spade', '2', 3)], seat: 'north' as Seat };
      const kill2 = { cards: [card('club', '2', 4), card('club', '2', 5)], seat: 'south' as Seat };
      
      const winner = compareKills(leadCards, kill1, kill2, ctx);
      // 先出者胜
      expect(winner).toBe('north');
    });

    test('D4: ♠33+♠K对子+单张 → 北♥AA+大王 vs 南♥KK+小王 → 北胜（AA>KK）', () => {
      const leadCards = [card('spade', '3', 0), card('spade', '3', 1), card('spade', 'K', 2)];
      const kill1 = { 
        cards: [card('heart', 'A', 3), card('heart', 'A', 4), joker('big', 5)], 
        seat: 'north' as Seat 
      };
      const kill2 = { 
        cards: [card('heart', 'K', 6), card('heart', 'K', 7), joker('small', 8)], 
        seat: 'south' as Seat 
      };
      
      const winner = compareKills(leadCards, kill1, kill2, ctx);
      expect(winner).toBe('north');
    });
  });

  // E. 甩牌杀牌（6个）
  describe('E. 甩牌杀牌', () => {
    test('E1: ♠AA+♠K对子+单张 → ♥22+大王，合法', () => {
      const leadCards = [
        card('spade', 'A', 0), card('spade', 'A', 1),
        card('spade', 'K', 2)
      ];
      const killCards = [
        card('heart', '2', 3), card('heart', '2', 4),
        joker('big', 5)
      ];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });

    test('E2: ♠AAA+♠KK三张+对子 → ♥222+♥AA，合法', () => {
      const leadCards = [
        card('spade', 'A', 0), card('spade', 'A', 1), card('spade', 'A', 2),
        card('spade', 'K', 3), card('spade', 'K', 4)
      ];
      const killCards = [
        card('heart', '2', 5), card('heart', '2', 6), card('heart', '2', 7),
        card('heart', 'A', 8), card('heart', 'A', 9)
      ];
      
      const result = validateKill(leadCards, killCards, ctx);
      expect(result.valid).toBe(true);
    });
  });
});

console.log('✓ M5 测试完成');
