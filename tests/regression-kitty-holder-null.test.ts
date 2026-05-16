/**
 * Regression test for "坐庄时拿不到底牌" bug
 * 
 * Bug: When a player is the dealer and should be the kitty holder,
 * the backend incorrectly returns "you are not kitty holder" error.
 */

import { test, expect, describe } from "bun:test";
import { createGameEngine } from "../src/engine/game-loop";
import { canDeclare } from "../src/core/trump-state";

describe("Kitty Holder Access Bug Regression", () => {
  test("dealer should be kitty holder after no declaration (flipKitty path)", () => {
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
    
    let state = engine.getState();
    expect(state.trumpState.kittyHolder).toBe(null);
    expect(state.trumpState.currentTrump).toBe(null);
    
    engine.finalizeTrumpPhase();
    
    state = engine.getState();
    expect(state.dealer).toBe("south");
    expect(state.trumpState.kittyHolder).toBe("south");
    expect(state.trumpState.currentTrump).not.toBe(null);
  });

  test("dealer should be kitty holder after another player declares", () => {
    const engine = createGameEngine("2", "south", false, 12345);
    
    const deck = engine.prepareDeck();
    for (let round = 1; round <= 39; round++) {
      engine.dealOneRound(deck, round);
    }
    engine.setKitty(deck);
    
    const state = engine.getState();
    const eastHand = state.hands.get("east") || [];
    const levelCards = eastHand.filter(c => c.rank === "2" && !c.joker);
    
    if (levelCards.length >= 2) {
      const declareCards = levelCards.slice(0, 2);
      const canDec = canDeclare(state.trumpState, "east", declareCards, "2", "south");
      
      if (canDec) {
        const success = engine.tryDeclare("east", declareCards);
        expect(success).toBe(true);
        
        const afterDeclare = engine.getState();
        expect(afterDeclare.trumpState.kittyHolder).toBe("south");
        expect(afterDeclare.dealer).toBe("south");
        
        // After finalize, kittyHolder should still be south
        engine.finalizeTrumpPhase();
        const afterFinalize = engine.getState();
        expect(afterFinalize.trumpState.kittyHolder).toBe("south");
      }
    }
  });

  test("grab mode: declarer becomes kitty holder", () => {
    const engine = createGameEngine("2", "south", true, 12345);
    
    const declaringPlayer = {
      seat: "east" as const,
      name: "Declaring AI",
      chooseTrump: (hand: any[]) => {
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
    
    // In grab mode, declarer becomes dealer AND kitty holder
    if (state.trumpState.currentTrump?.declarer === "east") {
      expect(state.dealer).toBe("east");
      expect(state.trumpState.kittyHolder).toBe("east");
    }
  });
});
