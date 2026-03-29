import { describe, it, expect } from "bun:test";
import { handleChaoDiPass } from "../webapi/routes/run-chaodi";
import { getChaoDiOptions } from "../web-deal-service";
import { canChaoDi, chaoDi, createGameContext, declare, createTrumpState } from "../src/core/trump-state";
import type { Card, Seat } from "../src/core/types";

function levelCard(id: number, suit: "spade" | "heart" | "club" | "diamond", rank: "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A"): Card {
  return { id, suit, rank } as Card;
}

function makeReq(body: unknown) {
  return new Request("http://localhost/api/chao-di-pass-generic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("单机炒底 pass 后继续轮询回归", () => {
  it("东家庄且东家亮主时，南家 pass 后不应卡在等待其他玩家炒底", async () => {
    const level = "3";

    const eastHeartSingle = [levelCard(1, "heart", "3")];
    const southSpadePair = [levelCard(2, "spade", "3"), levelCard(3, "spade", "3")];
    const westClubPair = [levelCard(4, "club", "3"), levelCard(5, "club", "3")];
    const kitty = [
      levelCard(100, "diamond", "5"),
      levelCard(101, "diamond", "6"),
      levelCard(102, "diamond", "7"),
      levelCard(103, "diamond", "8"),
      levelCard(104, "diamond", "9"),
      levelCard(105, "diamond", "10"),
    ];

    let trumpState = createTrumpState(false);
    trumpState = declare(trumpState, "east", eastHeartSingle, level, "east");
    trumpState = {
      ...trumpState,
      kittyHolder: "east",
      phase: "declared",
    };

    const state = {
      level,
      dealer: "east" as Seat,
      trumpState,
      ctx: createGameContext(level, trumpState),
      kitty: [...kitty],
      hands: new Map<Seat, Card[]>([
        ["east", []],
        ["north", []],
        ["west", [...westClubPair]],
        ["south", [...southSpadePair]],
      ]),
    };

    const westAI = {
      chooseChaoDi: () => [...westClubPair],
    };

    const session: any = {
      id: "test-session",
      engine: {
        getState: () => state,
        getPlayer: (seat: Seat) => (seat === "west" ? westAI : null),
      },
      humanSeats: new Set<Seat>(["south"]),
      players: new Map(),
      phase: "chaodi",
      awaitingDiscard: false,
      pendingChaodiSettle: false,
      teamLevels: { eastWest: "2", northSouth: "2" },
      logger: null,
      currentLeader: null,
      currentTrick: [],
      roundNumber: 0,
      scores: new Map(),
      nextChaodiSeat: "south" as Seat,
      chaodiRound: 1,
      chaodiPassCount: 0,
    };

    const sessions = new Map([[session.id, session]]);
    const deps = {
      sessions,
      json: (data: any, status = 200) => new Response(JSON.stringify(data), { status }),
      summarize: (_session: any, playerSeat: Seat) => ({
        phase: _session.phase,
        playerSeat,
        chaoDiOptions: getChaoDiOptions(_session, playerSeat),
      }),
      getChaoDiOptions,
      canChaoDi,
      chaoDi,
      createGameContext,
    };

    const response = await handleChaoDiPass(makeReq({ sessionId: session.id, playerSeat: "south" }), deps);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect((result as any).ok).toBe(true);
    expect((result as any).passed).toBe(true);
    expect((result as any).waitingForHuman).toBe(true);
    expect((result as any).humanSeat).toBe("south");
    expect((result as any).state.phase).toBe("chaodi");
    expect(Array.isArray((result as any).state.chaoDiOptions)).toBe(true);
    expect((result as any).state.chaoDiOptions.length).toBeGreaterThan(0);
    expect(session.phase).toBe("chaodi");
    expect(state.trumpState.currentTrump?.declarer).toBe("west");
    expect(state.trumpState.currentTrump?.suit).toBe("club");
  });
});
