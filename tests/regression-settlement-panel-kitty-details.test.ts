import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: settlement panel keeps kitty details', () => {
  test('done-phase UI shows kitty taken, multiplier, kitty score, and final score fields', () => {
    const source = readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');
    expect(source).toContain("t(lang, 'kittyDetail')");
    expect(source).toContain("t(lang, 'isKittyTaken')");
    expect(source).toContain("t(lang, 'kittyMultiplier')");
    expect(source).toContain("t(lang, 'kittyScore')");
    expect(source).toContain("t(lang, 'finalScore')");
  });
});
