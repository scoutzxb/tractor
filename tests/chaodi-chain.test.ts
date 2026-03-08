import { describe, it, expect } from "bun:test";
import { 
  canChaoDi, chaoDi, TRUMP_PRIORITY, createTrumpState, declare, confirmDiscard 
} from "../src/core/trump-state";

describe("炒底链：南炒底后西应可继续炒底", () => {
  it("场景：东亮主单张♠3 → 南用♣3对炒底 → 西应可用大王对继续炒底", () => {
    // 1. 初始状态：东亮主单张♠3（优先级7）
    let state = createTrumpState(false);
    state = declare(state, "east", [{ id: 1, rank: "3", suit: "spade" } as any], "3", "west");
    
    // 状态检查
    expect(state.currentTrump?.declarer).toBe("east");
    expect(state.kittyHolder).toBe("west"); // 庄家持有底牌
    expect(state.currentTrump?.priority).toBe(TRUMP_PRIORITY.SINGLE_SUIT);
    
    // 2. 西(庄家)不能炒底，因为他是kittyHolder
    const bigJokerPair = [
      { id: 1, joker: "big" as const, rank: "joker" as const },
      { id: 2, joker: "big" as const, rank: "joker" as const }
    ];
    expect(canChaoDi(state, "west", bigJokerPair, "3")).toBe(false);
    
    // 3. 南可以用♣3对炒底（优先级6 < 7）
    const club3Pair = [
      { id: 3, rank: "3" as const, suit: "club" as const },
      { id: 4, rank: "3" as const, suit: "club" as const }
    ];
    expect(canChaoDi(state, "south", club3Pair, "3")).toBe(true);
    
    // 4. 南炒底成功
    state = chaoDi(state, "south", club3Pair, "3");
    expect(state.kittyHolder).toBe("south"); // 南现在持有底牌
    expect(state.currentTrump?.declarer).toBe("south");
    expect(state.currentTrump?.priority).toBe(TRUMP_PRIORITY.PAIR_SAME_SUIT);
    
    // 5. 【关键测试】南炒底后，西应可继续炒底
    // 西的大王对优先级(4) < 南的♣3对优先级(6)，可以炒底
    expect(canChaoDi(state, "west", bigJokerPair, "3")).toBe(true);
    
    // 6. 南不能再炒底，因为他是kittyHolder
    const heart3Pair = [
      { id: 5, rank: "3" as const, suit: "heart" as const },
      { id: 6, rank: "3" as const, suit: "heart" as const }
    ];
    expect(canChaoDi(state, "south", heart3Pair, "3")).toBe(false);
    
    // 7. 西炒底成功
    state = chaoDi(state, "west", bigJokerPair, "3");
    expect(state.kittyHolder).toBe("west");
    expect(state.currentTrump?.declarer).toBe("west");
    expect(state.currentTrump?.priority).toBe(TRUMP_PRIORITY.PAIR_BIG_JOKER);
    
    // 8. 西炒底后，东(原亮主者)应可继续炒底（如果有更高优先级）
    // 东需要三张大王或三张小王才能炒底
    const threeBigJokers = [
      { id: 1, joker: "big" as const, rank: "joker" as const },
      { id: 2, joker: "big" as const, rank: "joker" as const },
      { id: 3, joker: "big" as const, rank: "joker" as const }
    ];
    expect(canChaoDi(state, "east", threeBigJokers, "3")).toBe(true);
  });
});
