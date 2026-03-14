// 回归测试：大小王拖拉机跟牌验证
// Bug: 当领牌是长拖拉机（如4连）时，跟牌方有短但高牌的拖拉机（如大小王拖拉机）必须跟
// 修复前：只检查是否有长度>=领牌的拖拉机，忽略了高牌短拖拉机
// 来源: game_2026-03-13T12-02-49_88sfsmdu.md 第5轮
//
// 实际场景：
// - 西家领牌：♣2 ♣2 ♠A ♠A ♠K ♠K ♠Q ♠Q （8张，4连主拖拉机）
// - 南家手牌：大王大王小王小王 + ♦2对♥2对♠K♠Q♠10♠9对♠7♠6对
// - 南家实际出牌：♠6对♠9对♦2对♥2对（非法，因为有大小王拖拉机却没有出）
// - 正确跟法：必须包含大小王拖拉机 + 4张其他主牌（因为总共需要跟8张）

import { describe, it, expect } from 'bun:test';
import { validateFollowPlay } from '../src/core/follow-validator';
import type { Card, GameContext } from '../src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);
const joker = (type: 'small' | 'big', id: number): Card => ({ id, joker: type } as Card);

describe('大小王拖拉机跟牌验证 - 回归测试', () => {
  // 主花色黑桃，级牌2
  const ctx: GameContext = { level: '2', trumpSuit: 'spade' };

  it('南家实际出牌（非法）：有拖拉机却出低牌对子', () => {
    // 西家领牌：♣2 ♣2 ♠A ♠A ♠K ♠K ♠Q ♠Q （8张4连主拖拉机）
    const leadCards = [
      card('club', '2', 0), card('club', '2', 1),
      card('spade', 'A', 2), card('spade', 'A', 3),
      card('spade', 'K', 4), card('spade', 'K', 5),
      card('spade', 'Q', 6), card('spade', 'Q', 7),
    ];

    // 南家实际出的牌：♠6对♠9对♦2对♥2对（混合低牌对子）
    // 注意：♠6对和♠9对不连续（中间有♠7,♠8,♠10,J等），所以不是拖拉机
    const southActualPlay = [
      card('spade', '6', 10), card('spade', '6', 11),
      card('spade', '9', 12), card('spade', '9', 13),
      card('diamond', '2', 14), card('diamond', '2', 15),
      card('heart', '2', 16), card('heart', '2', 17),
    ];

    // 南家第5轮时的完整手牌（39张初始手牌减去前4轮出的牌）
    // 初始主牌：大王大王小王小王 ♠2 ♥2 ♥2 ♦2 ♦2 ♠K ♠Q ♠10 ♠9 ♠9 ♠7 ♠6 ♠6
    // 前4轮南家出牌：第2轮♥4♥7，第3轮♥J♥8，第4轮♦6♦6
    // 剩余主牌：大王大王小王小王 ♠2 ♥2 ♥2 ♦2 ♦2 ♠K ♠Q ♠10 ♠9 ♠9 ♠7 ♠6 ♠6
    const southHandAtRound5 = [
      // 主牌
      joker('big', 100), joker('big', 101),
      joker('small', 102), joker('small', 103),
      card('spade', '2', 104),
      card('heart', '2', 105), card('heart', '2', 106),
      card('diamond', '2', 107), card('diamond', '2', 108),
      card('spade', 'K', 109),
      card('spade', 'Q', 110),
      card('spade', '10', 111),
      card('spade', '9', 112), card('spade', '9', 113),
      card('spade', '7', 114),
      card('spade', '6', 115), card('spade', '6', 116),
      // 副牌（其他花色）
      card('heart', 'K', 200), card('heart', 'Q', 201), card('heart', 'J', 202),
      card('heart', '8', 203), card('heart', '7', 204), card('heart', '3', 205), card('heart', '3', 206),
      card('club', 'K', 300), card('club', 'Q', 301), card('club', 'J', 302),
      card('club', '8', 303), card('club', '7', 304), card('club', '5', 305), card('club', '3', 306),
      card('diamond', 'A', 400), card('diamond', 'K', 401), card('diamond', 'Q', 402),
      card('diamond', '6', 403), card('diamond', '6', 404), card('diamond', '4', 405), card('diamond', '3', 406),
    ];

    // 此出牌应该非法：手牌中有大小王拖拉机，却出了低牌对子
    const result = validateFollowPlay(southActualPlay, leadCards, southHandAtRound5, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('拖拉机');
  });

  it('南家正确跟法（合法）：出大小王拖拉机+低牌对子', () => {
    // 西家领牌：♣2 ♣2 ♠A ♠A ♠K ♠K ♠Q ♠Q （8张4连主拖拉机）
    const leadCards = [
      card('club', '2', 0), card('club', '2', 1),
      card('spade', 'A', 2), card('spade', 'A', 3),
      card('spade', 'K', 4), card('spade', 'K', 5),
      card('spade', 'Q', 6), card('spade', 'Q', 7),
    ];

    // 正确的跟法：大小王拖拉机（4张）+ ♦2对♥2对（4张）= 8张
    // 注意：虽然♦2和♥2花色不同，但在主牌中都是级牌，可以形成拖拉机吗？不行，不同花色不能形成拖拉机
    // 所以这是：大小王拖拉机 + 两个独立的级牌对子
    const correctFollow = [
      joker('small', 10), joker('small', 11),
      joker('big', 12), joker('big', 13),
      card('diamond', '2', 14), card('diamond', '2', 15),
      card('heart', '2', 16), card('heart', '2', 17),
    ];

    // 南家第5轮时的完整手牌
    const southHandAtRound5 = [
      joker('big', 100), joker('big', 101),
      joker('small', 102), joker('small', 103),
      card('spade', '2', 104),
      card('heart', '2', 105), card('heart', '2', 106),
      card('diamond', '2', 107), card('diamond', '2', 108),
      card('spade', 'K', 109),
      card('spade', 'Q', 110),
      card('spade', '10', 111),
      card('spade', '9', 112), card('spade', '9', 113),
      card('spade', '7', 114),
      card('spade', '6', 115), card('spade', '6', 116),
      card('heart', 'K', 200), card('heart', 'Q', 201),
      card('club', 'K', 300), card('club', 'Q', 301),
      card('diamond', 'A', 400), card('diamond', 'K', 401),
    ];

    // 出大小王拖拉机+其他主牌应该合法
    const result = validateFollowPlay(correctFollow, leadCards, southHandAtRound5, ctx);
    expect(result.valid).toBe(true);
  });
});
