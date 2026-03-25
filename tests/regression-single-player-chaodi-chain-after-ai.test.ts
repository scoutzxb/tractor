import { describe, it, expect } from "bun:test";
import { processChaodiPolling } from "../webapi/routes/run-chaodi";
import { getChaoDiOptions } from "../web-deal-service";
import { canChaoDi, chaoDi, createGameContext, declare, createTrumpState } from "../src/core/trump-state";
import type { Card, Seat } from "../src/core/types";

function levelCard(id: number, suit: "spade" | "heart" | "club" | "diamond", rank: "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A"): Card {
  return { id, suit, rank } as Card;
}

describe("单人模式炒底链回归", () => {
  it("南家扣底后，若西家先炒底，南家仍应获得继续炒底机会", () => {
    const level = "3";

    const northSpadeSingle = [levelCard(1, "spade", "3")];
    const westClubPair = [levelCard(2, "club", "3"), levelCard(3, "club", "3")];
    const southSpadePair = [levelCard(4, "spade", "3"), levelCard(5, "spade", "3")];
    const kitty = [
      levelCard(100, "diamond", "5"),
      levelCard(101, "diamond", "6"),
      levelCard(102, "diamond", "7"),
      levelCard(103, "diamond", "8"),
      levelCard(104, "diamond", "9"),
      levelCard(105, "diamond", "10"),
    ];

    let trumpState = createTrumpState(false);
    trumpState = declare(trumpState, "north", northSpadeSingle, level, "south");
    trumpState = {
      ...trumpState,
      kittyHolder: "south",
      phase: "declared",
    };

    const state = {
      level,
      dealer: "south" as Seat,
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
      teamLevels: { eastWest: "2", northSouth: "2" },
      logger: null,
      currentLeader: null,
      currentTrick: [],
      roundNumber: 0,
      scores: new Map(),
      nextChaodiSeat: "west" as Seat,
      chaodiRound: 1,
      chaodiPassCount: 0,
    };

    const deps = { getChaoDiOptions, canChaoDi, chaoDi, createGameContext };
    const result = processChaodiPolling(session, "south", deps);

    expect(result.type).toBe("waiting-for-human");
    if (result.type !== "waiting-for-human") throw new Error("expected waiting-for-human");

    expect(result.humanSeat).toBe("south");
    expect(session.phase).toBe("chaodi");
    expect(state.trumpState.currentTrump?.declarer).toBe("west");
    expect(state.trumpState.currentTrump?.suit).toBe("club");
    expect(state.trumpState.kittyHolder).toBe("west");

    const southOptions = getChaoDiOptions(session, "south");
    expect(southOptions.some((o) => o.cards.length === 2 && o.cards.every((c) => c.suit === "spade" && c.rank === level))).toBe(true);
  });
});
