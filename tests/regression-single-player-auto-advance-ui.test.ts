import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player UI auto-advance', () => {
  test('play-phase auto-advance effect is present for single-player', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("if (currentMode !== 'single' || !sessionId || !state) return");
    expect(source).toContain("if (state.phase === 'play') {");
    expect(source).toContain("if (state.waitingNextRound) {");
    expect(source).toContain("if (state.currentTurn === playerSeat) return");
    expect(source).toContain("/api/advance-play");
  });
});
