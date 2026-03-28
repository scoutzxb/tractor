import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player UI auto-advance', () => {
  test('play-phase auto-advance effect is not disabled for single-player', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).not.toContain("if (currentMode === 'single' || !sessionId || !state || state.phase !== 'play') return");
    expect(source).toContain("if (!sessionId || !state || state.phase !== 'play') return");
    expect(source).toContain("const advResp = await post('/api/advance-play', { sessionId, playerSeat })");
  });
});
