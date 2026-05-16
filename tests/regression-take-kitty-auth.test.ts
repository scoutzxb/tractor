/**
 * Regression test for "坐庄时拿不到底牌" (can't take kitty when dealer) bug
 * 
 * This test verifies that the kittyHolder check in take-kitty works correctly.
 */

import { test, expect, describe } from "bun:test";
import { createGameEngine } from "../src/engine/game-loop";

describe("Take Kitty Authorization", () => {
  test("the kittyHolder should match the dealer in normal mode after finalizeTrumpPhase", () => {
    const engine = createGameEngine("2", "west", false, 12345);
    
    const mockPlayer = {
      seat: "east" as const,
      name: "Test AI",
      chooseTrump: () => null,
      chooseChaoDi: () => null,
      discardKitty: (hand: any[]) => hand.slice(0, 39),
      playCards: (hand: any[]) => [hand[0]]
    };
    
    engine.registerPlayer({ ...mockPlayer, seat: "east" });
    engine.registerPlayer({ ...mockPlayer, seat: "north" });
    engine.registerPlayer({ ...mockPlayer, seat: "west" });
    engine.registerPlayer({ ...mockPlayer, seat: "south" });
    
    const deck = engine.prepareDeck();
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    engine.setKitty(deck);
    engine.finalizeTrumpPhase();
    
    const state = engine.getState();
    
    // This assertion should never fail - if it does, there's a bug
    expect(state.trumpState.kittyHolder).toBe("west");
    
    // Simulate what take-kitty.ts does:
    const kittyHolder = state.trumpState.kittyHolder;
    const playerSeat = "west";
    
    // This check should pass for the dealer
    expect(kittyHolder === playerSeat).toBe(true);
  });

  test("should NOT allow non-kittyHolder to take kitty", () => {
    const engine = createGameEngine("2", "west", false, 12345);
    
    const mockPlayer = {
      seat: "east" as const,
      name: "Test AI",
      chooseTrump: () => null,
      chooseChaoDi: () => null,
      discardKitty: (hand: any[]) => hand.slice(0, 39),
      playCards: (hand: any[]) => [hand[0]]
    };
    
    engine.registerPlayer({ ...mockPlayer, seat: "east" });
    engine.registerPlayer({ ...mockPlayer, seat: "north" });
    engine.registerPlayer({ ...mockPlayer, seat: "west" });
    engine.registerPlayer({ ...mockPlayer, seat: "south" });
    
    const deck = engine.prepareDeck();
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    engine.setKitty(deck);
    engine.finalizeTrumpPhase();
    
    const state = engine.getState();
    
    // west is the kittyHolder
    expect(state.trumpState.kittyHolder).toBe("west");
    
    // south is NOT the kittyHolder
    const kittyHolder = state.trumpState.kittyHolder;
    const playerSeat = "south";
    
    // This check should fail for non-dealer
    expect(kittyHolder === playerSeat).toBe(false);
    expect(kittyHolder !== playerSeat).toBe(true);
  });

  test("kittyHolder should NOT be null after finalizeTrumpPhase", () => {
    const engine = createGameEngine("2", "north", false, 12345);
    
    const mockPlayer = {
      seat: "east" as const,
      name: "Test AI",
      chooseTrump: () => null,
      chooseChaoDi: () => null,
      discardKitty: (hand: any[]) => hand.slice(0, 39),
      playCards: (hand: any[]) => [hand[0]]
    };
    
    engine.registerPlayer({ ...mockPlayer, seat: "east" });
    engine.registerPlayer({ ...mockPlayer, seat: "north" });
    engine.registerPlayer({ ...mockPlayer, seat: "west" });
    engine.registerPlayer({ ...mockPlayer, seat: "south" });
    
    const deck = engine.prepareDeck();
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    engine.setKitty(deck);
    engine.finalizeTrumpPhase();
    
    const state = engine.getState();
    
    // CRITICAL: kittyHolder should NEVER be null after finalizeTrumpPhase
    // If this assertion fails, the bug "can't get kitty when dealer" will occur
    expect(state.trumpState.kittyHolder).not.toBeNull();
    expect(state.trumpState.kittyHolder).not.toBeUndefined();
    expect(state.trumpState.kittyHolder).toBe("north");
  });
});
