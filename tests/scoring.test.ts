// M6 完整测试：计分与升级

import { describe, test, expect } from 'bun:test';
import {
  getPointCards,
  getKittyMultiplier,
  checkJDemotion,
  calculateResult,
  applyUpgrade,
  checkVictory,
  getDealerTeam,
  isTeammate,
  getNextSeat,
  getPartner
} from '../src/core/scoring';
import { parseCards } from '../src/core/parser';
import type { Card, GameContext, Seat, Rank, TeamLevels } from '../src/core/types';

// 辅助函数
const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);

describe('M6: 计分与升级', () => {
  // 测试用例1-3: 得分牌识别
  describe('A. 得分牌识别', () => {
    test('A1: 5=5分，10=10分，K=10分', () => {
      const cards = [
        card('spade', '5', 0),
        card('heart', '10', 1),
        card('club', 'K', 2)
      ];
      
      const score = getPointCards(cards);
      expect(score).toBe(25); // 5 + 10 + 10
    });

    test('A2: 非得分牌=0分', () => {
      const cards = [
        card('spade', 'A', 0),
        card('heart', '3', 1),
        card('club', '7', 2)
      ];
      
      const score = getPointCards(cards);
      expect(score).toBe(0);
    });

    test('A3: 3副牌全部得分牌 = 总分300', () => {
      const cards: Card[] = [];
      let id = 0;
      
      // 3副牌，每副牌有4个5、4个10、4个K
      for (let deck = 0; deck < 3; deck++) {
        // 每副牌：4花色各一张5、一张10、一张K
        for (const suit of ['spade', 'heart', 'club', 'diamond']) {
          cards.push(card(suit, '5', id++));     // 5分
          cards.push(card(suit, '10', id++));    // 10分
          cards.push(card(suit, 'K', id++));     // 10分
        }
      }
      
      const score = getPointCards(cards);
      // 3副 × (4×5 + 4×10 + 4×10) = 3 × (20 + 40 + 40) = 3 × 100 = 300
      expect(score).toBe(300);
    });
  });

  // 测试用例4-6: 升级判定
  describe('B. 升级判定', () => {
    test('B1: 攻方0分 → 守方升3级', () => {
      const teamLevels: TeamLevels = { eastWest: '3', northSouth: '3' };
      const result = calculateResult(0, [], 'defense', [], { level: '3', trumpSuit: 'heart', dealer: 'east' as Seat, teamLevels });
      
      expect(result.defenseUpgrade).toBe(3);
      expect(result.attackUpgrade).toBe(0);
    });

    test('B2: 攻方115分 → 守方升1级', () => {
      const teamLevels: TeamLevels = { eastWest: '3', northSouth: '3' };
      const result = calculateResult(115, [], 'defense', [], { level: '3', trumpSuit: 'heart', dealer: 'east' as Seat, teamLevels });
      
      expect(result.defenseUpgrade).toBe(1);
      expect(result.attackUpgrade).toBe(0);
    });

    test('B3: 攻方120分 → 换庄不升级', () => {
      const teamLevels: TeamLevels = { eastWest: '3', northSouth: '3' };
      const result = calculateResult(120, [], 'attack', [], { level: '3', trumpSuit: 'heart', dealer: 'east' as Seat, teamLevels });
      
      expect(result.defenseUpgrade).toBe(0);
      expect(result.attackUpgrade).toBe(0);
    });

    test('B4: 攻方300分 → 攻方升3级', () => {
      const teamLevels: TeamLevels = { eastWest: '3', northSouth: '3' };
      const result = calculateResult(300, [], 'attack', [], { level: '3', trumpSuit: 'heart', dealer: 'east' as Seat, teamLevels });
      
      expect(result.defenseUpgrade).toBe(0);
      expect(result.attackUpgrade).toBe(3);
    });
  });

  // 测试用例7-10: 抠底倍数
  describe('C. 抠底倍数', () => {
    const ctx: GameContext = { level: '2', trumpSuit: 'heart' };

    test('C1: 单张抠底 ×2', () => {
      const cards = [card('spade', 'K', 0)];
      const parsed = parseCards(cards, ctx);
      const multiplier = getKittyMultiplier(parsed);
      
      expect(multiplier).toBe(2);
    });

    test('C2: 对子抠底 ×4', () => {
      const cards = [card('spade', 'K', 0), card('spade', 'K', 1)];
      const parsed = parseCards(cards, ctx);
      const multiplier = getKittyMultiplier(parsed);
      
      expect(multiplier).toBe(4);
    });

    test('C3: 拖拉机3连抠底 ×16', () => {
      const cards = [
        card('spade', 'J', 0), card('spade', 'J', 1),
        card('spade', 'Q', 2), card('spade', 'Q', 3),
        card('spade', 'K', 4), card('spade', 'K', 5)
      ];
      const parsed = parseCards(cards, ctx);
      const multiplier = getKittyMultiplier(parsed);
      
      expect(multiplier).toBe(16);
    });

    test('C4: 三张抠底 ×6', () => {
      const cards = [card('spade', 'K', 0), card('spade', 'K', 1), card('spade', 'K', 2)];
      const parsed = parseCards(cards, ctx);
      const multiplier = getKittyMultiplier(parsed);
      
      expect(multiplier).toBe(6);
    });
  });

  // 测试用例11-13: 必打级别
  describe('D. 必打级别', () => {
    test('D1: 打3升2级 → 到5停（必打）', () => {
      const currentLevel: Rank = '3';
      const upgrade = 2;
      const mandatoryLevels: Rank[] = ['2', '5', '10', 'J', 'K'];
      const exemptLevels: Rank[] = [];
      
      const newLevel = applyUpgrade(currentLevel, upgrade, mandatoryLevels, exemptLevels);
      expect(newLevel).toBe('5');
    });

    test('D2: 打3升3级 → 到5停（必打）', () => {
      const currentLevel: Rank = '3';
      const upgrade = 3;
      const mandatoryLevels: Rank[] = ['2', '5', '10', 'J', 'K'];
      const exemptLevels: Rank[] = [];
      
      const newLevel = applyUpgrade(currentLevel, upgrade, mandatoryLevels, exemptLevels);
      expect(newLevel).toBe('5');
    });
  });

  // 测试用例14-15: J抠底降级
  describe('E. J抠底降级', () => {
    const ctx: GameContext = { level: 'J', trumpSuit: 'heart' };

    test('E1: 打J闲家J抠底 → 庄家降回2', () => {
      const cards = [card('spade', 'J', 0), card('spade', 'J', 1)];
      const parsed = parseCards(cards, ctx);
      const shouldDemote = checkJDemotion(parsed, ctx);
      
      expect(shouldDemote).toBe(true);
    });

    test('E2: 打J闲家大王大王+JJ抠底 → 最大组件大王，J不在 → 不降级', () => {
      const cards = [
        { id: 0, joker: 'big' } as Card,
        { id: 1, joker: 'big' } as Card,
        card('spade', 'J', 2),
        card('spade', 'J', 3)
      ];
      const parsed = parseCards(cards, ctx);
      const shouldDemote = checkJDemotion(parsed, ctx);
      
      expect(shouldDemote).toBe(false);
    });
  });

  // 测试用例16-17: 交庄判定
  describe('F. 交庄判定', () => {
    test('F1: 守方胜 → 交庄给对家', () => {
      const nextDealer = getPartner('east' as Seat);
      expect(nextDealer).toBe('west');
    });

    test('F2: 攻方胜 → 逆时针交庄', () => {
      const nextDealer = getNextSeat('east' as Seat);
      expect(nextDealer).toBe('north');
    });

    test('F3: 东的队友是西', () => {
      expect(isTeammate('east' as Seat, 'west' as Seat)).toBe(true);
      expect(isTeammate('east' as Seat, 'north' as Seat)).toBe(false);
    });
  });

  // 测试用例18: 胜利判定
  describe('G. 胜利判定', () => {
    test('G1: 升过A获胜', () => {
      expect(checkVictory('AA')).toBe(true);
      expect(checkVictory('A')).toBe(false);
      expect(checkVictory('K')).toBe(false);
    });
  });
});

console.log('✓ M6 测试完成');
