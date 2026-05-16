import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

const source = () => readFileSync('/home/workspace/tractor/webapp/src/App.tsx', 'utf-8');

describe('regression: multiplayer UI sync does not hide human plays', () => {
  test('non-host multiplayer clients poll state during human turns instead of returning early', () => {
    const app = source();
    expect(app).not.toContain("if (state.currentTurn === playerSeat || state.waitingNextRound) return");
    expect(app).toContain("const humanSeats: Seat[] = state.humanSeats || []");
    expect(app).toContain("const isAiTurn = !!state.currentTurn && !humanSeats.includes(state.currentTurn)");
    expect(app).toContain("if (currentMode === 'two' && isAiTurn) {");
    expect(app).toContain("const d = await post('/api/state', { sessionId, playerSeat, playerToken })");
  });

  test('only the host advances multiplayer dealing; other clients state-poll', () => {
    const app = source();
    expect(app).toContain("if (state?.phase !== 'dealing' || !sessionId) return");
    expect(app).toContain("if (currentMode === 'single' || isHost) {");
    expect(app).toContain("await tick()");
    expect(app).toContain("const d = await post('/api/state', { sessionId, playerSeat, playerToken })");
  });

  test('non-dealer multiplayer clients keep syncing during kitty so they can enter play', () => {
    const app = source();
    expect(app).toContain("if (currentMode === 'single' || !sessionId || !state || state.phase !== 'kitty') return");
    expect(app).toContain("if (state.kittyHolder === playerSeat && state.awaitingDiscard) return");
    expect(app).toContain("const d = await post('/api/state', { sessionId, playerSeat, playerToken })");
  });

  test('non-host clients fetch replacement session state after host starts next game', () => {
    const app = source();
    expect(app).toContain("if (d.replacementSessionId) {");
    expect(app).toContain("const next = await post('/api/state', { sessionId: d.replacementSessionId, playerSeat, playerToken })");
    expect(app).toContain("if (!next.error) {");
    expect(app).toContain("setSessionId(d.replacementSessionId)");
    expect(app).toContain("setState(next)");
    expect(app).not.toContain("setState(d)\n          }");
  });

  test('multiplayer clients keep syncing during chaodi waiting screen', () => {
    const app = source();
    expect(app).toContain("if (currentMode === 'single' || !sessionId || !state || state.phase !== 'chaodi') return");
    expect(app).toContain("const d = await post('/api/state', { sessionId, playerSeat, playerToken })");
    expect(app).toContain("return () => { cancelled = true; window.clearInterval(pollInterval) }");
  });

  test('stale multiplayer run-chaodi errors fall back to state refresh', () => {
    const app = source();
    expect(app).toContain("if (d?.error) {");
    expect(app).toContain("const fresh = await post('/api/state', { sessionId, playerSeat, playerToken })");
    expect(app).toContain("if (!fresh.error) setState(fresh)");
  });
});
