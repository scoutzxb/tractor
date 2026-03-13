/**
 * 回归测试：第11轮杀牌比较错误（无主局）
 *
 * 场景来源：game_2026-03-13T00-01-08_mijflukb.md 第11轮
 *
 * 问题：无主局，东(首家)领出对子+单张 (♦Q♦Q♦A)，
 * 北杀牌出对子♣5+单张♥5，西杀牌出对子♠5+单张小王
 * 两家杀牌都是主牌，结构都是对子+单张
 * 无主局所有5都是同级主牌，所以对子相同，应该先出的北赢
 * 系统错误判定西赢（因为西的小王单张更大）
 *
 * 规则：甩牌单张+对子，杀牌比较的是对子大小，对子相同的先出的大
 */

import { describe, it, expect } from 'bun:test';
import { getWinningPlay } from '../src/core/trick-judge';
import type { Card, GameContext, Seat } from '../src/core/types';

describe('回归测试：第11轮杀牌比较错误（无主局，对子+单张）', () => {
  const ctx: GameContext = {
    trumpSuit: null,  // 无主局
    level: '5',       // 当前级别是5，无主局时所有5都是主牌
    eastWestLevel: 6,
    northSouthLevel: 14  // A=14
  };

  it('无主局，对子相同的杀牌应该先出的赢', () => {
    // 东(首家)领出：对子♦Q + 单张♦A
    const eastLead: Card[] = [
      { id: 1, suit: 'diamond', rank: 'Q' },
      { id: 2, suit: 'diamond', rank: 'Q' },
      { id: 3, suit: 'diamond', rank: 'A' }
    ];

    // 北杀牌：对子♣5(主牌) + 单张♥5(主牌)
    // 出牌顺序：东 -> 北 -> 西 -> 南
    const northKill: Card[] = [
      { id: 4, suit: 'club', rank: '5' },
      { id: 5, suit: 'club', rank: '5' },
      { id: 6, suit: 'heart', rank: '5' }
    ];

    // 西杀牌：对子♠5(主牌) + 单张小王(主牌)
    const westKill: Card[] = [
      { id: 7, suit: 'spade', rank: '5' },
      { id: 8, suit: 'spade', rank: '5' },
      { id: 9, joker: 'small' }
    ];

    // 南垫牌（不参与比较）
    const southDiscard: Card[] = [
      { id: 10, suit: 'club', rank: 'J' },
      { id: 11, suit: 'club', rank: '8' },
      { id: 12, suit: 'heart', rank: '8' }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'east', cards: eastLead },
      { seat: 'north', cards: northKill },
      { seat: 'west', cards: westKill },
      { seat: 'south', cards: southDiscard }
    ];

    const result = getWinningPlay(plays, ctx);

    // 无主局：大王 > 小王 > 所有5(同级) > 其他牌
    // 北的对子♣5和西的对子♠5都是5，同级
    // 对子相同，先出的北应该赢
    expect(result.seat).toBe('north');
  });

  it('无主局，更大的对子应该赢', () => {
    // 东(首家)领出：对子♦Q + 单张♦A
    const eastLead: Card[] = [
      { id: 1, suit: 'diamond', rank: 'Q' },
      { id: 2, suit: 'diamond', rank: 'Q' },
      { id: 3, suit: 'diamond', rank: 'A' }
    ];

    // 北杀牌：对子♣5(主牌) + 单张小王(主牌)
    const northKill: Card[] = [
      { id: 4, suit: 'club', rank: '5' },
      { id: 5, suit: 'club', rank: '5' },
      { id: 6, joker: 'small' }
    ];

    // 西杀牌：对子小王(主牌) + 单张大王(主牌)
    // 对子小王 > 对子5
    const westKill: Card[] = [
      { id: 7, joker: 'small' },
      { id: 8, joker: 'small' },
      { id: 9, joker: 'big' }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'east', cards: eastLead },
      { seat: 'north', cards: northKill },
      { seat: 'west', cards: westKill }
    ];

    const result = getWinningPlay(plays, ctx);

    // 西的对子(小王小王) > 北的对子(♣5♣5)
    expect(result.seat).toBe('west');
  });

  it('无主局，相同对子时单张大小不影响结果', () => {
    // 东(首家)领出：对子♦Q + 单张♦A
    const eastLead: Card[] = [
      { id: 1, suit: 'diamond', rank: 'Q' },
      { id: 2, suit: 'diamond', rank: 'Q' },
      { id: 3, suit: 'diamond', rank: 'A' }
    ];

    // 北杀牌：对子♣5 + 单张大王
    const northKill: Card[] = [
      { id: 4, suit: 'club', rank: '5' },
      { id: 5, suit: 'club', rank: '5' },
      { id: 6, joker: 'big' }
    ];

    // 西杀牌：对子♠5 + 单张小王（单张比北小）
    const westKill: Card[] = [
      { id: 7, suit: 'spade', rank: '5' },
      { id: 8, suit: 'spade', rank: '5' },
      { id: 9, joker: 'small' }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'east', cards: eastLead },
      { seat: 'north', cards: northKill },
      { seat: 'west', cards: westKill }
    ];

    const result = getWinningPlay(plays, ctx);

    // 对子相同(都是5)，先出的北应该赢（单张大小不影响）
    expect(result.seat).toBe('north');
  });
});

console.log('✓ 第11轮杀牌比较回归测试');
