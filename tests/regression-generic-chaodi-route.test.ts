import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

describe('regression: generic chaodi route exists', () => {
  test('server exposes /api/chao-di for frontend doChaodi()', () => {
    const source = readFileSync('/home/workspace/tractor/web-deal-service.ts', 'utf-8');
    expect(source).toContain('if (url.pathname === "/api/chao-di" && req.method === "POST")');
    expect(source).toContain('return handleChaoDiManual(req, deps);');
  });
});
