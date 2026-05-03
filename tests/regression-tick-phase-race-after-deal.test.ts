import { describe, expect, test } from 'bun:test';
import { handleTick } from '../webapi/routes/tick';

function req(body: any): Request {
  return new Request('http://localhost/api/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function makeSession(phase: string, done = false) {
  return {
    id: 'test-session',
    phase,
    done,
    round: 39,
  };
}

describe('regression: stale dealing tick after deal completion', () => {
  test('tick during postDeal returns current state instead of not-in-dealing error', async () => {
    const session = makeSession('postDeal');
    const sessions = new Map([['test-session', session]]);
    const response = await handleTick(req({ sessionId: 'test-session', playerSeat: 'south' }), {
      sessions,
      summarize: (s: any, playerSeat: string) => ({ phase: s.phase, playerSeat }),
      json,
    });
    const result: any = await response.json();

    expect(response.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.alreadyAdvanced).toBe(true);
    expect(result.phase).toBe('postDeal');
    expect(result.state.phase).toBe('postDeal');
  });

  test('tick after postDeal finalizes to kitty returns kitty state instead of dealing-already-done error', async () => {
    const session = makeSession('kitty', true);
    const sessions = new Map([['test-session', session]]);
    const response = await handleTick(req({ sessionId: 'test-session', playerSeat: 'south' }), {
      sessions,
      summarize: (s: any, playerSeat: string) => ({ phase: s.phase, playerSeat }),
      json,
    });
    const result: any = await response.json();

    expect(response.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.alreadyAdvanced).toBe(true);
    expect(result.phase).toBe('kitty');
    expect(result.state.phase).toBe('kitty');
  });
});
