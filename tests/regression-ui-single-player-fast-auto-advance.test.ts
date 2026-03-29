import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player keeps fast auto-advance', () => {
  test('single-player play loop uses immediate timeout-based advance instead of waiting for interval polling', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("const timer = window.setTimeout(runSinglePlayerAutopilot, 250)");
    expect(source).toContain("if (currentMode !== 'single' || !sessionId || !state) return");
    expect(source).toContain("if (state.phase === 'play') {");
    expect(source).toContain("const d = await post('/api/advance-play', { sessionId, playerSeat })");
  });
});
