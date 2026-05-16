/**
 * Regression test for "坐庄时拿不到底牌" bug in web service flow
 * 
 * This test simulates the exact API calls made by the frontend
 * to reproduce the bug where a player is shown as kittyHolder
 * but gets "you are not kitty holder" error.
 */

import { test, expect, describe } from "bun:test";
import { createGameEngine } from "../src/engine/game-loop";

describe("Web Service Kitty Flow", () => {
  test("kittyHolder should be set correctly after finalizeTrumpPhase", () => {
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
    
    // Deal all cards
    const deck = engine.prepareDeck();
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    // Set kitty
    engine.setKitty(deck);
    
    // Check state before finalize
    const stateBefore = engine.getState();
    expect(stateBefore.trumpState.kittyHolder).toBe(null);
    expect(stateBefore.trumpState.currentTrump).toBe(null);
    expect(stateBefore.dealer).toBe("south");
    
    // Finalize - this should call flipKitty and set kittyHolder to dealer
    engine.finalizeTrumpPhase();
    
    const stateAfter = engine.getState();
    expect(stateAfter.trumpState.kittyHolder).toBe("south");
    expect(stateAfter.trumpState.currentTrump).not.toBe(null);
    expect(stateAfter.dealer).toBe("south");
  });

  test("kittyHolder should not be null after finalizeTrumpPhase", () => {
    // This is the most important test - it reproduces the bug
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
    
    // This is the critical assertion - kittyHolder should NEVER be null after finalize
    expect(state.trumpState.kittyHolder).not.toBeNull();
    expect(state.trumpState.kittyHolder).toBe("west"); // dealer
  });

  test("human dealer should not be marked awaiting discard before actually taking kitty", () => {
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
    
    // Deal all cards
    const deck = engine.prepareDeck();
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    
    // Set kitty
    engine.setKitty(deck);
    
    // Check state before finalize
    const stateBefore = engine.getState();
    expect(stateBefore.trumpState.kittyHolder).toBe(null);
    expect(stateBefore.trumpState.currentTrump).toBe(null);
    expect(stateBefore.dealer).toBe("south");
    
    // Finalize - this should call flipKitty and set kittyHolder to dealer
    engine.finalizeTrumpPhase();
    
    const stateAfter = engine.getState();
    expect(stateAfter.trumpState.kittyHolder).toBe("south");
    expect(stateAfter.trumpState.currentTrump).not.toBe(null);
    expect(stateAfter.dealer).toBe("south");
  });
});
