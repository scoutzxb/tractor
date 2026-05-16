/**
 * Regression test for post-deal-tick race condition bug
 * 
 * Bug: In two-player mode, both players poll /api/post-deal-tick every 500ms.
 * When one player's request triggers phase change (postDeal → kitty),
 * the other player's next request arrives when phase is no longer "postDeal",
 * causing "not in postDeal phase" error to be shown.
 * 
 * Fix: When phase is not "postDeal", return current state instead of error.
 */

import { describe, it, expect } from "bun:test";
import { handlePostDealTick } from "../webapi/routes/post-deal-tick";
import { createGameEngine } from "../src/engine/game-loop";
import { SimpleAI } from "../src/ai/simple-player";
import type { Session } from "../web-deal-service";
import { createDeck, shuffle } from "../src/core/deck";
import type { Card, Seat } from "../src/core/types";

// Mock dependencies
function createMockSession(overrides: Partial<Session> = {}): Session {
  const engine = createGameEngine({
    dealer: "south" as Seat,
    level: "2",
    mode: "normal",
    players: {
      east: new SimpleAI("east"),
      north: new SimpleAI("north"),
      west: new SimpleAI("west"),
      south: new SimpleAI("south"),
    },
    deck: shuffle(createDeck(), Math.random),
  });

  const session: Session = {
    id: "test-session",
    engine,
    deck: createDeck(),
    round: 39,
    done: false,
    phase: "postDeal",
    postDealStartTime: Date.now() - 16000, // 16 seconds ago (past timeout)
    awaitingDiscard: false,
    pendingChaodiSettle: false,
    mode: "normal",
    isGrabMode: false,
    configuredLevel: "2",
    configuredDealer: "south",
    humanSeats: new Set(["south", "north"]),
    playerMode: "two",
    isMultiplayer: true,
    teamLevels: { eastWest: "2", northSouth: "2" },
    exemptions: new Map(),
    lastLogIndex: 0,
    currentLeader: null,
    currentTrick: [],
    roundNumber: 0,
    scores: new Map(),
    tricks: [],
    waitingNextRound: false,
    lastRoundReview: null,
    gameResult: null,
    logger: null as any,
    dealingCardsLog: [],
    players: new Map(),
    chaodiRound: 0,
    nextChaodiSeat: null,
    chaodiPassCount: 0,
    ...overrides,
  };

  return session;
}

describe("post-deal-tick race condition", () => {
  it("should return error when session not found", async () => {
    const sessions = new Map<string, Session>();
    const deps = {
      sessions,
      summarize: (s: Session) => ({ phase: s.phase }),
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
    };

    const req = new Request("http://localhost/api/post-deal-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "nonexistent", playerSeat: "south" }),
    });

    const response = await handlePostDealTick(req, deps);
    const result = await response.json();

    expect(response.status).toBe(404);
    expect((result as any).error).toBe("session not found");
  });

  it("should return success with current state when phase is not postDeal", async () => {
    // This is the key test for the race condition fix
    const session = createMockSession({
      phase: "kitty", // Phase already changed by another request
    });
    const sessions = new Map([["test-session", session]]);

    const deps = {
      sessions,
      summarize: (s: Session, playerSeat: string) => ({ 
        phase: s.phase, 
        playerSeat 
      }),
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
    };

    const req = new Request("http://localhost/api/post-deal-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", playerSeat: "north" }),
    });

    const response = await handlePostDealTick(req, deps);
    const result = await response.json();

    // Should return success, not error
    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).phase).toBe("kitty");
    expect((result as any).remainingMs).toBe(0);
    expect((result as any).state.phase).toBe("kitty");
    
    // Should NOT have error field
    expect((result as any).error).toBeUndefined();
  });

  it("should return remaining time when still in postDeal phase", async () => {
    const session = createMockSession({
      phase: "postDeal",
      postDealStartTime: Date.now() - 2000, // 2 seconds ago
    });
    const sessions = new Map([["test-session", session]]);

    const deps = {
      sessions,
      summarize: (s: Session, playerSeat: string) => ({ 
        phase: s.phase, 
        playerSeat 
      }),
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
    };

    const req = new Request("http://localhost/api/post-deal-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", playerSeat: "south" }),
    });

    const response = await handlePostDealTick(req, deps);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).phase).toBe("postDeal");
    expect((result as any).remainingMs).toBeGreaterThan(0);
    expect((result as any).remainingMs).toBeLessThanOrEqual(13000);
  });

  it("should handle phase changes: postDeal → play", async () => {
    // Test when phase has changed to play (after AI auto-discard)
    const session = createMockSession({
      phase: "play",
      currentTurn: "south",
    });
    const sessions = new Map([["test-session", session]]);

    const deps = {
      sessions,
      summarize: (s: Session, playerSeat: string) => ({ 
        phase: s.phase, 
        currentTurn: s.currentTurn,
        playerSeat 
      }),
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
    };

    const req = new Request("http://localhost/api/post-deal-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", playerSeat: "north" }),
    });

    const response = await handlePostDealTick(req, deps);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).phase).toBe("play");
    expect((result as any).error).toBeUndefined();
  });

  it("should handle phase changes: postDeal → chaodi", async () => {
    // Test when phase has changed to chaodi (normal mode, after AI discard)
    const session = createMockSession({
      phase: "chaodi",
    });
    const sessions = new Map([["test-session", session]]);

    const deps = {
      sessions,
      summarize: (s: Session, playerSeat: string) => ({ 
        phase: s.phase, 
        playerSeat 
      }),
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
    };

    const req = new Request("http://localhost/api/post-deal-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", playerSeat: "south" }),
    });

    const response = await handlePostDealTick(req, deps);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).phase).toBe("chaodi");
    expect((result as any).error).toBeUndefined();
  });

  it("should enter kitty phase for a human dealer without marking awaitingDiscard before take-kitty", async () => {
    const session = createMockSession({
      humanSeats: new Set(["south"]),
      playerMode: "single",
      isMultiplayer: false,
      phase: "postDeal",
      postDealStartTime: Date.now() - 16000,
    });
    const state = session.engine.getState();
    const deck = session.deck;
    state.level = "2";
    state.dealer = "south";
    state.hands.set("east", deck.slice(0, 39));
    state.hands.set("north", deck.slice(39, 78));
    state.hands.set("west", deck.slice(78, 117));
    state.hands.set("south", deck.slice(117, 156));
    state.trumpState.currentTrump = {
      suit: "spade",
      priority: 7,
      cards: [{ id: 999001, suit: "spade", rank: "2" }],
      declarer: "south",
      level: "2",
    };
    state.trumpState.kittyHolder = "south";

    const sessions = new Map([["test-session", session]]);
    const deps = {
      sessions,
      summarize: (s: Session) => {
        const st: any = s.engine.getState();
        return {
          phase: s.phase,
          kittyHolder: st.trumpState.kittyHolder,
          awaitingDiscard: s.awaitingDiscard,
          kittyCount: st.kitty.length,
          handCounts: {
            east: (st.hands.get("east") || []).length,
            north: (st.hands.get("north") || []).length,
            west: (st.hands.get("west") || []).length,
            south: (st.hands.get("south") || []).length,
          },
        };
      },
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
      serverLog: () => {},
    };

    const req = new Request("http://localhost/api/post-deal-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", playerSeat: "south" }),
    });

    const response = await handlePostDealTick(req, deps);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).phase).toBe("kitty");
    expect((result as any).state.phase).toBe("kitty");
    expect((result as any).state.kittyHolder).toBe("south");
    expect((result as any).state.awaitingDiscard).toBe(false);
    expect((result as any).state.kittyCount).toBe(6);
    expect((result as any).state.handCounts.south).toBe(39);
  });
});