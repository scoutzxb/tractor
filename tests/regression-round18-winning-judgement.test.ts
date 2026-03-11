/**
 * 回归测试：第18轮赢牌判定错误（无主局）
 *
 * 场景来源：game_2026-03-10T21-33-01_ximb7jl6.md 第18轮
 *
 * 问题：无主局，南家领出4张♠（♠6 ♠Q ♠5 ♠10），东家跟出♠5 ♥Q ♥5 ♣2
 * 东家只有第1张是♠，其余3张是垫牌（♥Q ♥5 ♣2），不应该参与赢牌判定
 * 系统错误判定东家赢，实际南家有♠Q应该赢
 *
 * 规则：如果跟牌者出了多门花色（没有正确跟牌），直接判负，
 * 即使他们的领牌花色单张比别人大也不能赢
 */

import { describe, it, expect } from 'bun:test';
import { getWinningPlay, getWinningPlayDetailed } from '../src/core/trick-judge';
import type { Card, GameContext, Seat } from '../src/core/types';

describe('回归测试：第18轮赢牌判定错误（无主局）', () => {
  const ctx: GameContext = {
    trumpSuit: null,
    level: '2',
    eastWestLevel: 2,
    northSouthLevel: 2
  };

  it('东家混合出牌（仅1张领牌花色）时不应赢得该轮', () => {
    // 南家领出4张♠
    const southLead: Card[] = [
      { id: 1, suit: 'spade', rank: '6', joker: undefined },
      { id: 2, suit: 'spade', rank: 'Q', joker: undefined },
      { id: 3, suit: 'spade', rank: '5', joker: undefined },
      { id: 4, suit: 'spade', rank: '10', joker: undefined }
    ];

    // 东家跟出：1张♠ + 3张垫牌（多门花色）
    const eastPlay: Card[] = [
      { id: 5, suit: 'spade', rank: '5', joker: undefined },  // 只有这一张是♠
      { id: 6, suit: 'heart', rank: 'Q', joker: undefined }, // 垫牌
      { id: 7, suit: 'heart', rank: '5', joker: undefined }, // 垫牌
      { id: 8, suit: 'club', rank: '2', joker: undefined }   // 垫牌
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: southLead },
      { seat: 'east', cards: eastPlay }
    ];

    const result = getWinningPlay(plays, ctx);

    // 东家出了多门花色，应该输
    // 南家正确跟出4张♠，应该赢
    expect(result.seat).toBe('south');
  });

  it('东家完全没有领牌花色时更应输给南家', () => {
    // 南家领出4张♠
    const southLead: Card[] = [
      { id: 1, suit: 'spade', rank: '6', joker: undefined },
      { id: 2, suit: 'spade', rank: 'Q', joker: undefined },
      { id: 3, suit: 'spade', rank: '5', joker: undefined },
      { id: 4, suit: 'spade', rank: '10', joker: undefined }
    ];

    // 东家跟出：完全没有♠，全是垫牌
    const eastPlay: Card[] = [
      { id: 5, suit: 'heart', rank: 'A', joker: undefined },
      { id: 6, suit: 'heart', rank: 'Q', joker: undefined },
      { id: 7, suit: 'club', rank: 'K', joker: undefined },
      { id: 8, suit: 'diamond', rank: 'A', joker: undefined }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: southLead },
      { seat: 'east', cards: eastPlay }
    ];

    const result = getWinningPlay(plays, ctx);

    // 东家没有♠，应该输
    expect(result.seat).toBe('south');
  });

  it('严格规则：出多门花色者即使单张最大也直接判负', () => {
    // 场景：南家领出4张♠（小牌）
    const southLead: Card[] = [
      { id: 1, suit: 'spade', rank: '6', joker: undefined },
      { id: 2, suit: 'spade', rank: '7', joker: undefined },
      { id: 3, suit: 'spade', rank: '8', joker: undefined },
      { id: 4, suit: 'spade', rank: '9', joker: undefined }
    ];

    // 东家跟出：1张♠A（最大）+ 3张其他花色
    // 即使♠A是黑桃中最大的，东家也不应该赢，因为没跟牌
    const eastPlay: Card[] = [
      { id: 5, suit: 'spade', rank: 'A', joker: undefined },  // 最大的♠
      { id: 6, suit: 'heart', rank: '2', joker: undefined }, // 垫牌
      { id: 7, suit: 'club', rank: '3', joker: undefined },  // 垫牌
      { id: 8, suit: 'diamond', rank: '4', joker: undefined } // 垫牌
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: southLead },
      { seat: 'east', cards: eastPlay }
    ];

    const result = getWinningPlay(plays, ctx);

    // 东家出了多门花色，即使♠A最大也应该输
    // 南家正确跟出4张♠，应该赢
    expect(result.seat).toBe('south');
  });

  it('有效杀牌（主牌杀副牌）应该仍然正常工作', () => {
    // 主牌是♥，无主局时主牌只有级牌(2)和王
    const trumpCtx: GameContext = {
      trumpSuit: 'heart',
      level: '2',
      eastWestLevel: 2,
      northSouthLevel: 2
    };

    // 南家领出♠对子（副牌拖拉机）
    const southLead: Card[] = [
      { id: 1, suit: 'spade', rank: 'A', joker: undefined },
      { id: 2, suit: 'spade', rank: 'A', joker: undefined },
      { id: 3, suit: 'spade', rank: 'K', joker: undefined },
      { id: 4, suit: 'spade', rank: 'K', joker: undefined }
    ];

    // 北家跟出♠对子（正确跟牌）
    const northPlay: Card[] = [
      { id: 5, suit: 'spade', rank: 'Q', joker: undefined },
      { id: 6, suit: 'spade', rank: 'Q', joker: undefined },
      { id: 7, suit: 'spade', rank: 'J', joker: undefined },
      { id: 8, suit: 'spade', rank: 'J', joker: undefined }
    ];

    // 东家杀牌：出主牌拖拉机（♥A♥A♥K♥K）
    // 无主局时，主牌=♥花色牌 + 级牌(2) + 王
    const eastPlay: Card[] = [
      { id: 9, suit: 'heart', rank: 'A', joker: undefined },
      { id: 10, suit: 'heart', rank: 'A', joker: undefined },
      { id: 11, suit: 'heart', rank: 'K', joker: undefined },
      { id: 12, suit: 'heart', rank: 'K', joker: undefined }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: southLead },
      { seat: 'north', cards: northPlay },
      { seat: 'east', cards: eastPlay }
    ];

    const result = getWinningPlay(plays, trumpCtx);

    // 东家出的是主牌杀牌，应该赢
    expect(result.seat).toBe('east');
  });

  it('多个杀牌时比较大小：大的杀牌赢', () => {
    // 主牌是♥
    const trumpCtx: GameContext = {
      trumpSuit: 'heart',
      level: '2',
      eastWestLevel: 2,
      northSouthLevel: 2
    };

    // 南家领出♠对子
    const southLead: Card[] = [
      { id: 1, suit: 'spade', rank: 'A', joker: undefined },
      { id: 2, suit: 'spade', rank: 'A', joker: undefined },
      { id: 3, suit: 'spade', rank: 'K', joker: undefined },
      { id: 4, suit: 'spade', rank: 'K', joker: undefined }
    ];

    // 西家杀牌：♥K♥K♥Q♥Q（较小的主牌拖拉机）
    const westPlay: Card[] = [
      { id: 5, suit: 'heart', rank: 'K', joker: undefined },
      { id: 6, suit: 'heart', rank: 'K', joker: undefined },
      { id: 7, suit: 'heart', rank: 'Q', joker: undefined },
      { id: 8, suit: 'heart', rank: 'Q', joker: undefined }
    ];

    // 东家杀牌：♥A♥A♥K♥K（较大的主牌拖拉机）
    const eastPlay: Card[] = [
      { id: 9, suit: 'heart', rank: 'A', joker: undefined },
      { id: 10, suit: 'heart', rank: 'A', joker: undefined },
      { id: 11, suit: 'heart', rank: 'K', joker: undefined },
      { id: 12, suit: 'heart', rank: 'K', joker: undefined }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: southLead },
      { seat: 'west', cards: westPlay },
      { seat: 'east', cards: eastPlay }
    ];

    const result = getWinningPlay(plays, trumpCtx);

    // 东家的杀牌更大（♥A > ♥K），应该赢
    expect(result.seat).toBe('east');
  });

  it('杀牌vs跟牌：杀牌应该赢', () => {
    // 主牌是♥
    const trumpCtx: GameContext = {
      trumpSuit: 'heart',
      level: '2',
      eastWestLevel: 2,
      northSouthLevel: 2
    };

    // 南家领出♠A♠A♠K♠K（拖拉机：2个连续对子）
    const southLead: Card[] = [
      { id: 1, suit: 'spade', rank: 'A', joker: undefined },
      { id: 2, suit: 'spade', rank: 'A', joker: undefined },
      { id: 3, suit: 'spade', rank: 'K', joker: undefined },
      { id: 4, suit: 'spade', rank: 'K', joker: undefined }
    ];

    // 北家正确跟出♠Q♠Q♠J♠J（更大的拖拉机）
    const northPlay: Card[] = [
      { id: 5, suit: 'spade', rank: 'Q', joker: undefined },
      { id: 6, suit: 'spade', rank: 'Q', joker: undefined },
      { id: 7, suit: 'spade', rank: 'J', joker: undefined },
      { id: 8, suit: 'spade', rank: 'J', joker: undefined }
    ];

    // 东家杀牌：主牌拖拉机 ♥K♥K♥Q♥Q
    // 主牌♥K♥Q是相邻的，可以形成拖拉机
    const eastPlay: Card[] = [
      { id: 9, suit: 'heart', rank: 'K', joker: undefined },
      { id: 10, suit: 'heart', rank: 'K', joker: undefined },
      { id: 11, suit: 'heart', rank: 'Q', joker: undefined },
      { id: 12, suit: 'heart', rank: 'Q', joker: undefined }
    ];

    const plays: Array<{ seat: Seat; cards: Card[] }> = [
      { seat: 'south', cards: southLead },
      { seat: 'north', cards: northPlay },
      { seat: 'east', cards: eastPlay }
    ];

    const result = getWinningPlay(plays, trumpCtx);

    // 东家出的是主牌杀牌，应该赢（主牌杀副牌）
    expect(result.seat).toBe('east');
  });
});

console.log('✓ 第18轮赢牌判定回归测试');
