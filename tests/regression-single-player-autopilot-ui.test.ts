import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player UI autopilot', () => {
  test('single-player autopilot advances postDeal, chaodi, and passive play', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("if (currentMode !== 'single' || !sessionId || !state) return");
    expect(source).toContain("if (state.phase === 'postDeal') {");
    expect(source).toContain("await postDealTick()");
    expect(source).toContain("if (state.phase === 'chaodi') {");
    expect(source).toContain("/api/run-chaodi");
    expect(source).toContain("if (state.phase === 'play') {");
    expect(source).toContain("/api/advance-play");
  });
});
