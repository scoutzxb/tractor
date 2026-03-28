import { describe, expect, test } from 'bun:test';
import { resolvePostRoundState, type RoundResult } from '../src/core/scoring';
import type { Rank, Seat } from '../src/core/types';

describe('regression: J demotion uses 120-point threshold', () => {
  test('J demotion applies at exactly 120 even when attackUpgrade is 0', () => {
    const result: RoundResult = {
      attackScore: 120,
      kittyScore: 0,
      totalScore: 120,
      defenseUpgrade: 0,
      attackUpgrade: 0,
      nextDealer: 'north',
      jDemotion: true,
    };

    const resolved = resolvePostRoundState(
      result,
      'east',
      { eastWest: 'J', northSouth: '9' },
      { eastWest: [], northSouth: [] }
    );

    expect(resolved.jDemotionApplied).toBe(true);
    expect(resolved.nextTeamLevels.eastWest).toBe('2');
  });

  test('J demotion does not apply below 120 even if jDemotion flag is true', () => {
    const result: RoundResult = {
      attackScore: 115,
      kittyScore: 0,
      totalScore: 115,
      defenseUpgrade: 1,
      attackUpgrade: 0,
      nextDealer: 'west',
      jDemotion: true,
    };

    const resolved = resolvePostRoundState(
      result,
      'east',
      { eastWest: 'J', northSouth: '9' },
      { eastWest: [], northSouth: [] }
    );

    expect(resolved.jDemotionApplied).toBe(false);
    expect(resolved.nextTeamLevels.eastWest).toBe('Q');
  });
});
