/**
 * Regression test for dealer selection bug
 * 
 * Bug: When user selects a dealer (e.g., "west") in the lobby, but the game
 * assigns the kitty to the wrong player because flipKitty was called without
 * the dealer parameter in finalizeTrumpPhase().
 * 
 * Expected: When dealer="west" is selected, the kitty holder should be "west"
 * in normal mode.
 */

import { test, expect, describe } from "bun:test";
import { createGameEngine } from "../src/engine/game-loop";

describe("Dealer Selection Bug Regression", () => {
  test("normal mode: kitty holder should be the configured dealer when no declaration", () => {
    const engine = createGameEngine("2", "west", false, 12345);
    
    // Register AI players
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
    
    // Prepare and deal cards
    const deck = engine.prepareDeck();
    
    // Deal all 39 rounds
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    // Set kitty
    engine.setKitty(deck);
    
    // Finalize trump phase (this is where the bug was)
    engine.finalizeTrumpPhase();
    
    const state = engine.getState();
    
    // The dealer should still be "west"
    expect(state.dealer).toBe("west");
    
    // In normal mode, kitty holder should be the dealer
    expect(state.trumpState.kittyHolder).toBe("west");
  });
  
  test("normal mode: kitty holder should be the configured dealer (south)", () => {
    const engine = createGameEngine("2", "south", false, 12345);
    
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
    
    expect(state.dealer).toBe("south");
    expect(state.trumpState.kittyHolder).toBe("south");
  });
  
  test("normal mode: kitty holder should be the configured dealer (north)", () => {
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
    
    expect(state.dealer).toBe("north");
    expect(state.trumpState.kittyHolder).toBe("north");
  });
  
  test("grab mode: declarer becomes dealer and kitty holder", () => {
    // In grab mode, the first person to declare becomes dealer
    const engine = createGameEngine("2", "south", true, 12345);
    
    // Mock player that declares on east
    const declaringPlayer = {
      seat: "east" as const,
      name: "Declaring AI",
      chooseTrump: (hand: any[]) => {
        // Find level cards in hand and return them
        const levelCards = hand.filter((c: any) => c.rank === "2" && !c.joker);
        return levelCards.length > 0 ? levelCards.slice(0, 2) : null;
      },
      chooseChaoDi: () => null,
      discardKitty: (hand: any[]) => hand.slice(0, 39),
      playCards: (hand: any[]) => [hand[0]]
    };
    
    engine.registerPlayer(declaringPlayer);
    engine.registerPlayer({ ...declaringPlayer, seat: "north", chooseTrump: () => null });
    engine.registerPlayer({ ...declaringPlayer, seat: "west", chooseTrump: () => null });
    engine.registerPlayer({ ...declaringPlayer, seat: "south", chooseTrump: () => null });
    
    const deck = engine.prepareDeck();
    
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    engine.setKitty(deck);
    engine.finalizeTrumpPhase();
    
    const state = engine.getState();
    
    // In grab mode, declarer becomes dealer
    if (state.trumpState.currentTrump?.declarer === "east") {
      expect(state.dealer).toBe("east");
      expect(state.trumpState.kittyHolder).toBe("east");
    }
  });
});
