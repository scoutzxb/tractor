/**
 * 回归测试：炒底后最终底牌显示错误
 *
 * 场景来源：game_2026-03-12T12-15-35_5ohg7b35.md 第2局
 *
 * 问题描述：
 * - 南拿底扣底：扣回底牌 ♠7 ♣4 ♦8 ♦4 ♥6 ♥2
 * - 东炒底成功：获得底牌 ♠7 ♣4 ♦8 ♦4 ♥6 ♥2，扣回底牌 ♣2 ♣4 ♥5 ♦6 ♦7 ♣8
 * - 西炒底成功：获得底牌 ♣2 ♣4 ♥5 ♦6 ♦7 ♣8，扣回底牌 ♦2 ♠2 ♥4 ♣5 ♠5 ♦6
 *
 * Bug：最终状态显示的底牌是南扣下的 ♠7 ♣4 ♦8 ♦4 ♥6 ♥2
 * 期望：最终底牌应该是西扣下的 ♦2 ♠2 ♥4 ♣5 ♠5 ♦6
 *
 * 问题根源：game-logger.ts 中的 kittyCards 在 recordKitty 中只设置一次，
 * 炒底后没有更新，导致最终状态显示的底牌不是最后一次炒底后的底牌
 */

import { describe, test, expect } from 'bun:test';
import { GameLogger } from '../webapi/game-logger';
import type { Card, Seat, Suit, GameContext } from '../src/core/types';

describe('回归测试：炒底后最终底牌显示', () => {
  test('多次炒底后最终底牌应显示最后一次炒底者扣下的牌', () => {
    const logger = new GameLogger(2, 'test-logs');

    // 模拟第2局第2轮的抓牌和亮主
    const dealer: Seat = 'south';
    const teamLevels = { eastWest: '2', northSouth: '3' };

    // 原始底牌（发牌后）
    const originalKitty: Card[] = [
      { id: 1, suit: 'heart', rank: '2' },
      { id: 2, suit: 'club', rank: '4' },
      { id: 3, suit: 'diamond', rank: '5' },
      { id: 4, suit: 'diamond', rank: 'J' },
      { id: 5, suit: 'club', rank: '9' },
      { id: 6, suit: 'spade', rank: 'K' },
    ];

    // 记录原始底牌
    logger.recordKitty(originalKitty);

    // 记录亮主（北亮主，主花色方块）
    logger.recordTrump('north', 'diamond' as Suit, [
      { id: 100, suit: 'diamond', rank: '3' }
    ], false);

    // 记录庄家（南）拿底扣底
    const dealerReceived = [...originalKitty];
    const dealerDiscarded: Card[] = [
      { id: 10, suit: 'spade', rank: '7' },
      { id: 11, suit: 'club', rank: '4' },
      { id: 12, suit: 'diamond', rank: '8' },
      { id: 13, suit: 'diamond', rank: '4' },
      { id: 14, suit: 'heart', rank: '6' },
      { id: 15, suit: 'heart', rank: '2' },
    ];
    logger.recordDealerKitty(dealer, dealerReceived, dealerDiscarded);

    // 记录东炒底（成功，无主）
    const eastChaoDiCards: Card[] = [
      { id: 200, joker: 'small' },
      { id: 201, joker: 'small' },
    ];
    const eastReceivedKitty = [...dealerDiscarded]; // 获得南扣下的底牌
    const eastDiscardedKitty: Card[] = [
      { id: 20, suit: 'club', rank: '2' },
      { id: 21, suit: 'club', rank: '4' },
      { id: 22, suit: 'heart', rank: '5' },
      { id: 23, suit: 'diamond', rank: '6' },
      { id: 24, suit: 'diamond', rank: '7' },
      { id: 25, suit: 'club', rank: '8' },
    ];
    logger.recordChaoDi('east', eastChaoDiCards, true,
      { suit: null, isNoTrump: true },
      eastReceivedKitty, eastDiscardedKitty
    );

    // 关键点：炒底后应该更新 kittyCards
    // 当前 Bug：logger 没有更新 kittyCards，导致最终状态显示错误的底牌

    // 记录西炒底（成功，无主）
    const westChaoDiCards: Card[] = [
      { id: 300, joker: 'big' },
      { id: 301, joker: 'big' },
    ];
    const westReceivedKitty = [...eastDiscardedKitty]; // 获得东扣下的底牌
    const westDiscardedKitty: Card[] = [
      { id: 30, suit: 'diamond', rank: '2' },
      { id: 31, suit: 'spade', rank: '2' },
      { id: 32, suit: 'heart', rank: '4' },
      { id: 33, suit: 'club', rank: '5' },
      { id: 34, suit: 'spade', rank: '5' },
      { id: 35, suit: 'diamond', rank: '6' },
    ];
    logger.recordChaoDi('west', westChaoDiCards, true,
      { suit: null, isNoTrump: true },
      westReceivedKitty, westDiscardedKitty
    );

    // 创建游戏上下文
    const ctx: GameContext = {
      level: '3',
      trumpSuit: null, // 无主
    };

    // 生成日志内容
    const content = (logger as any).generateLogContent(dealer, teamLevels, ctx);

    // 验证最终状态显示的底牌
    // Bug 状态：显示的是南扣下的 dealerDiscarded (♠7 ♣4 ♦8 ♦4 ♥6 ♥2)
    // 期望状态：显示的是西扣下的 westDiscardedKitty (♦2 ♠2 ♥4 ♣5 ♠5 ♦6)

    // 检查日志内容中的最终状态部分
    const finalStateMatch = content.match(/最终状态:[\s\S]*?底牌: ([^\n]+)/);
    expect(finalStateMatch).not.toBeNull();

    const displayedKitty = finalStateMatch![1];

    // 期望显示西扣下的底牌 ♦2 ♠2 ♥4 ♣5 ♠5 ♦6
    // 注意：formatCards 会按特定格式显示
    expect(displayedKitty).toContain('♦2');
    expect(displayedKitty).toContain('♠2');
    expect(displayedKitty).toContain('♥4');
    expect(displayedKitty).toContain('♣5');
    expect(displayedKitty).toContain('♠5');
    expect(displayedKitty).toContain('♦6');

    // 不应该显示南扣下的旧底牌
    expect(displayedKitty).not.toContain('♠7'); // 南扣下的牌不应该出现在最终底牌中
  });

  test('炒底过程中每次扣下的底牌都应被正确记录', () => {
    const logger = new GameLogger(2, 'test-logs');

    // 验证炒底记录中的底牌流转
    const originalKitty: Card[] = [
      { id: 1, suit: 'heart', rank: '2' },
    ];
    logger.recordKitty(originalKitty);

    const firstDiscarded: Card[] = [
      { id: 10, suit: 'spade', rank: '7' },
    ];
    logger.recordDealerKitty('south', originalKitty, firstDiscarded);

    const secondDiscarded: Card[] = [
      { id: 20, suit: 'club', rank: '2' },
    ];
    logger.recordChaoDi('east', [{ id: 200, joker: 'small' }], true,
      { suit: null, isNoTrump: true },
      firstDiscarded, secondDiscarded
    );

    const thirdDiscarded: Card[] = [
      { id: 30, suit: 'diamond', rank: '2' },
    ];
    logger.recordChaoDi('west', [{ id: 300, joker: 'big' }], true,
      { suit: null, isNoTrump: true },
      secondDiscarded, thirdDiscarded
    );

    // 验证 chaoDiRounds 中记录的底牌
    const state = logger.exportState();

    // 东炒底记录中应该显示获得的底牌是 firstDiscarded
    expect(state.chaoDiRounds[0].receivedKitty).toEqual(firstDiscarded);
    expect(state.chaoDiRounds[0].discardedKitty).toEqual(secondDiscarded);

    // 西炒底记录中应该显示获得的底牌是 secondDiscarded
    expect(state.chaoDiRounds[1].receivedKitty).toEqual(secondDiscarded);
    expect(state.chaoDiRounds[1].discardedKitty).toEqual(thirdDiscarded);
  });
});
