import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: play loop avoids extra state polling', () => {
  test('single-player fast loop uses advance-play and multiplayer sync loop uses state polling', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("if (currentMode === 'single' || !sessionId || !state || state.phase !== 'play') return");
    expect(source).toContain("const d = await post('/api/state', { sessionId, playerSeat })");
    expect(source).toContain("if (currentMode !== 'single' || !sessionId || !state) return");
    expect(source).toContain("const d = await post('/api/advance-play', { sessionId, playerSeat })");
  });
});
