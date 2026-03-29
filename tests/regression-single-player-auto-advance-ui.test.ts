import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player UI auto-advance', () => {
  test('play-phase auto-advance effect is present for single-player', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("window.setTimeout(async () => {");
    expect(source).toContain("if (currentMode !== 'single' || !sessionId || !state || state.phase !== 'play') return");
    expect(source).toContain("/api/advance-play");
  });
});
