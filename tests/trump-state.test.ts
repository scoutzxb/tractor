// M7 简化测试：亮主状态机核心功能

import { describe, test, expect } from 'bun:test';
import {
  createTrumpState,
  canDeclare,
  declare,
  flipKitty,
  getCurrentTrumpSuit,
  createGameContext,
  canChaoDi
} from '../src/core/trump-state';
import type { Card, Rank, Seat } from '../src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);
const joker = (type: string, id: number): Card => ({ id, joker: type as any });

describe('M7: 亮主状态机', () => {
  const level: Rank = '2';
  const dealer: Seat = 'east';

  test('创建初始状态', () => {
    const state = createTrumpState(false);
    expect(state.phase).toBe('dealing');
    expect(getCurrentTrumpSuit(state)).toBe(null);
  });

  test('一对红桃2亮主', () => {
    let state = createTrumpState(false);
    const cards = [card('heart', '2', 0), card('heart', '2', 1)];
    
    state = declare(state, 'north' as Seat, cards, level, dealer);
    expect(getCurrentTrumpSuit(state)).toBe('heart');
  });

  test('小王×2亮无主', () => {
    let state = createTrumpState(false);
    const cards = [joker('small', 0), joker('small', 1)];
    
    state = declare(state, 'east' as Seat, cards, level, dealer);
    expect(getCurrentTrumpSuit(state)).toBe(null);
  });

  test('三张红桃2亮主', () => {
    let state = createTrumpState(false);
    const cards = [card('heart', '2', 0), card('heart', '2', 1), card('heart', '2', 2)];
    
    state = declare(state, 'east' as Seat, cards, level, dealer);
    expect(getCurrentTrumpSuit(state)).toBe('heart');
  });

  test('无人亮主翻底牌', () => {
    let state = createTrumpState(false);
    const kitty = [card('heart', '2', 0)];
    
    state = flipKitty(state, kitty);
    expect(getCurrentTrumpSuit(state)).toBe('heart');
  });

  test('生成GameContext', () => {
    let state = createTrumpState(false);
    state = declare(state, 'east' as Seat, [card('heart', '2', 0), card('heart', '2', 1)], level, dealer);
    
    const ctx = createGameContext('2' as Rank, state);
    expect(ctx.level).toBe('2');
    expect(ctx.trumpSuit).toBe('heart');
  });

  test('回归: 炒底不允许单张级牌（北家单方块2亮主后，南家单红桃2不可炒）', () => {
    const seatHands = {
      east: [card('club', '2', 101), card('club', '9', 102), card('spade', 'K', 103)],
      north: [card('diamond', '2', 201), card('heart', '9', 202), card('club', 'J', 203)],
      west: [card('heart', '2', 301), card('spade', '10', 302), card('diamond', 'Q', 303)],
      south: [card('spade', '2', 401), card('spade', '2', 402), card('heart', '2', 403), card('club', 'A', 404)]
    };

    let state = createTrumpState(false);
    state = declare(state, 'north' as Seat, [seatHands.north[0]], level, dealer); // 北家单方块2

    const southSingleHeart = [seatHands.south[2]]; // 南家单红桃2
    const ok = canChaoDi(state, 'south' as Seat, southSingleHeart, level);

    expect(ok).toBe(false);
  });
});

console.log('✓ M7 测试完成');
