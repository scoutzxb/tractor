import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: single-player keeps fast auto-advance', () => {
  test('single-player play loop uses immediate timeout-based advance instead of waiting for interval polling', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("const timer = window.setTimeout(async () => {");
    expect(source).toContain("}, 50)");
    expect(source).toContain("if (currentMode === 'single' || !sessionId || !state || state.phase !== 'play') return");
  });
});
