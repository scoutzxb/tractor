import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player advances after trick review', () => {
  test('single-player autopilot handles waitingNextRound via next-round before continuing play', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("if (state.waitingNextRound) {");
    expect(source).toContain("const d = await post('/api/next-round', { sessionId, playerSeat })");
    expect(source).toContain("if (state.currentTurn === playerSeat) return");
    expect(source).toContain("const d = await post('/api/advance-play', { sessionId, playerSeat })");
  });
});
