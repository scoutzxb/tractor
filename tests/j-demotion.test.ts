import { describe, test, expect } from 'bun:test';
import { calculateResult } from '../src/core/scoring';
import type { Card } from '../src/core/types';

const c = (id: number, suit?: any, rank?: any, joker?: any): Card =>
  joker ? ({ id, joker } as Card) : ({ id, suit, rank } as Card);

const baseCtx = {
  level: 'J',
  trumpSuit: 'heart',
  dealer: 'east',
  teamLevels: { eastWest: 'J', northSouth: '9' }
} as any;

const kitty: Card[] = [
  c(1, 'spade', '5'),
  c(2, 'club', '10'),
  c(3, 'diamond', 'K')
];

describe('J-demotion settlement (core scoring)', () => {
  test('single J on last attack trick => jDemotion true', () => {
    const r = calculateResult(130, kitty, 'attack', [c(10, 'heart', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('single A on last attack trick => jDemotion false', () => {
    const r = calculateResult(130, kitty, 'attack', [c(11, 'heart', 'A')], baseCtx);
    expect(r.jDemotion).toBe(false);
  });

  test('tractor JJAA => jDemotion true', () => {
    const r = calculateResult(
      130,
      kitty,
      'attack',
      [c(20, 'heart', 'J'), c(21, 'heart', 'J'), c(22, 'heart', 'A'), c(23, 'heart', 'A')],
      baseCtx
    );
    expect(r.jDemotion).toBe(true);
  });

  test('tractor AAKK => jDemotion false', () => {
    const r = calculateResult(
      130,
      kitty,
      'attack',
      [c(30, 'heart', 'A'), c(31, 'heart', 'A'), c(32, 'heart', 'K'), c(33, 'heart', 'K')],
      baseCtx
    );
    expect(r.jDemotion).toBe(false);
  });

  test('throw component pair JJ + single A => true', () => {
    const r = calculateResult(
      130,
      kitty,
      'attack',
      [c(40, 'heart', 'J'), c(41, 'heart', 'J'), c(42, 'heart', 'A')],
      baseCtx
    );
    expect(r.jDemotion).toBe(true);
  });

  test('throw component pair AA + single J => true', () => {
    const r = calculateResult(
      130,
      kitty,
      'attack',
      [c(50, 'heart', 'A'), c(51, 'heart', 'A'), c(52, 'heart', 'J')],
      baseCtx
    );
    expect(r.jDemotion).toBe(true);
  });

  test('resolved kill-throw structure is authoritative (resolved has J => true)', () => {
    const raw = [c(60, 'heart', 'A'), c(61, 'heart', 'A'), c(62, 'heart', 'K'), c(63, 'heart', 'K')];
    const resolved = [
      { type: 'tractor', length: 2, cards: [c(64, 'heart', 'J'), c(65, 'heart', 'J'), c(66, 'heart', 'A'), c(67, 'heart', 'A')] }
    ] as any;

    const r = calculateResult(130, kitty, 'attack', raw, baseCtx, resolved);
    expect(r.jDemotion).toBe(true);
  });

  test('resolved kill-throw structure is authoritative (resolved no J => false)', () => {
    const raw = [c(70, 'heart', 'J'), c(71, 'heart', 'J'), c(72, 'heart', 'A'), c(73, 'heart', 'A')];
    const resolved = [
      { type: 'tractor', length: 2, cards: [c(74, 'heart', 'A'), c(75, 'heart', 'A'), c(76, 'heart', 'K'), c(77, 'heart', 'K')] }
    ] as any;

    const r = calculateResult(130, kitty, 'attack', raw, baseCtx, resolved);
    expect(r.jDemotion).toBe(false);
  });

  test('defense wins last trick => no kitty, no jDemotion', () => {
    const r = calculateResult(130, kitty, 'defense', [c(80, 'heart', 'J')], baseCtx);
    expect(r.kittyScore).toBe(0);
    expect(r.jDemotion).toBe(false);
  });
});

describe('User real examples (trump=heart, dealer=east)', () => {
  const sj = (id: number) => c(id, undefined, undefined, 'small');
  const bj = (id: number) => c(id, undefined, undefined, 'big');

  // north leads last round
  test('north lead: ♥J => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [c(201, 'heart', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: ♥J♥J => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [c(202, 'heart', 'J'), c(203, 'heart', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: ♥J♥J♥J => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [c(204, 'heart', 'J'), c(205, 'heart', 'J'), c(206, 'heart', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: small小王x2 + ♥Jx2 => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [sj(207), sj(208), c(209, 'heart', 'J'), c(210, 'heart', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: small小王x2 + ♣Jx2 => no', () => {
    const r = calculateResult(130, kitty, 'attack', [sj(211), sj(212), c(213, 'club', 'J'), c(214, 'club', 'J')], baseCtx);
    expect(r.jDemotion).toBe(false);
  });

  test('north lead: small小王 + ♣Jx2 => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [sj(215), c(216, 'club', 'J'), c(217, 'club', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: small小王x2 + ♣J => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [sj(218), sj(219), c(220, 'club', 'J')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: small小王x2 + ♣J + ♥A => yes', () => {
    const r = calculateResult(130, kitty, 'attack', [sj(221), sj(222), c(223, 'club', 'J'), c(224, 'heart', 'A')], baseCtx);
    expect(r.jDemotion).toBe(true);
  });

  test('north lead: small小王x2 + ♥J + big大王 => no', () => {
    const r = calculateResult(130, kitty, 'attack', [sj(225), sj(226), c(227, 'heart', 'J'), bj(228)], baseCtx);
    expect(r.jDemotion).toBe(false);
  });

  // east leads last round, north wins by kill/response; use resolved structure for correspondence mapping
  test('east lead AKK, north smallx2 + ♥J => yes', () => {
    const rawNorth = [sj(229), sj(230), c(231, 'heart', 'J')];
    const resolved = [
      { type: 'pair', cards: [sj(232), sj(233)] },
      { type: 'single', cards: [c(234, 'heart', 'J')] }
    ] as any;
    const r = calculateResult(130, kitty, 'attack', rawNorth as any, baseCtx, resolved);
    expect(r.jDemotion).toBe(true);
  });

  test('east lead AKQ, north smallx2 + ♥J => no', () => {
    const rawNorth = [sj(235), sj(236), c(237, 'heart', 'J')];
    const resolved = [
      { type: 'single', cards: [sj(238)] },
      { type: 'single', cards: [sj(239)] },
      { type: 'single', cards: [c(240, 'heart', 'J')] }
    ] as any;
    const r = calculateResult(130, kitty, 'attack', rawNorth as any, baseCtx, resolved);
    expect(r.jDemotion).toBe(false);
  });

  test('east lead AKKQQ, north smallx2 + ♥Jx2 + big => yes', () => {
    const rawNorth = [sj(241), sj(242), c(243, 'heart', 'J'), c(244, 'heart', 'J'), bj(245)];
    const resolved = [
      { type: 'tractor', length: 2, cards: [sj(246), sj(247), c(248, 'heart', 'J'), c(249, 'heart', 'J')] },
      { type: 'single', cards: [bj(250)] }
    ] as any;
    const r = calculateResult(130, kitty, 'attack', rawNorth as any, baseCtx, resolved);
    expect(r.jDemotion).toBe(true);
  });

  test('east lead AKKJJ, north smallx2 + ♥Jx2 + big => no', () => {
    const rawNorth = [sj(251), sj(252), c(253, 'heart', 'J'), c(254, 'heart', 'J'), bj(255)];
    // 对应结构下的最大组件不含J（按你给的期望）
    const resolved = [
      { type: 'pair', cards: [sj(256), sj(257)] },
      { type: 'pair', cards: [bj(258), bj(259)] },
      { type: 'single', cards: [c(260, 'heart', 'A')] }
    ] as any;
    const r = calculateResult(130, kitty, 'attack', rawNorth as any, baseCtx, resolved);
    expect(r.jDemotion).toBe(false);
  });
});
