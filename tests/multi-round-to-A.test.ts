// Multi-Round Game Test: Simulate games from level 2 to A (victory)
// Tests level progression, dealer rotation, and win condition detection

import { describe, test, expect, beforeAll } from 'bun:test';
import { createGameEngine } from '../src/engine/game-loop';
import { SimpleAI } from '../src/ai/simple-player';
import { playOutHands } from '../src/engine/simulation';
import { leadCardsStrategy, followCardsStrategy, setThrowLeadRate, setCoverMode, setThrowRandomSource } from '../src/ai/play-strategy';
import { applyUpgrade } from '../src/core/scoring';
import type { Seat, Rank, GameContext, Card } from '../src/core/types';
import { seededRandom } from '../src/core/deck';

interface GameResult {
  roundNumber: number;
  dealer: Seat;
  trumpSuit: string | null;
  dealerTeamScore: number;
  defenderTeamScore: number;
  winner: 'dealer' | 'defender';
  nextDealer: Seat;
  teamLevelsBefore: { eastWest: Rank; northSouth: Rank };
  teamLevelsAfter: { eastWest: Rank; northSouth: Rank };
  defenseUpgrade: number;
  attackUpgrade: number;
  jDemotion: boolean;
}

interface MultiRoundResult {
  totalGames: number;
  victory: boolean;
  winningTeam: 'eastWest' | 'northSouth' | null;
  games: GameResult[];
  finalLevels: { eastWest: Rank; northSouth: Rank };
  jDemotionCount: number;
  maxLevelReached: { eastWest: Rank; northSouth: Rank };
}

/**
 * Run a single game and return the result
 */
function runSingleGame(
  eastWestLevel: Rank,
  northSouthLevel: Rank,
  dealer: Seat,
  seed: number,
  throwRate: number = 0.3
): GameResult {
  // Use dealer's team level as the game level
  const level = (dealer === 'east' || dealer === 'west') ? eastWestLevel : northSouthLevel;
  
  const engine = createGameEngine(level, dealer, false, seed);
  setThrowLeadRate(throwRate);
  setCoverMode('aggressive');
  setThrowRandomSource(seededRandom(seed + 12345));

  // Register AI players
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  const names = ['东', '北', '西', '南'];
  for (let i = 0; i < seats.length; i++) {
    engine.registerPlayer(new SimpleAI(seats[i], names[i]));
  }

  // Run dealing phase
  const dealing = engine.runDealingAndDeclarationRounds(39);

  // Run trump/kitty flow
  const trumpKitty = engine.runTrumpAndKittyFlow();
  const state = trumpKitty.stateAfterChaoDi;

  // Run trick simulation
  const sim = playOutHands({
    seats,
    dealer: state.dealer,
    level,
    teamLevels: { eastWest: eastWestLevel, northSouth: northSouthLevel },
    ctx: state.ctx!,
    kitty: state.kitty,
    hands: state.hands,
    leadStrategy: leadCardsStrategy,
    followStrategy: followCardsStrategy
  });

  const winner: 'dealer' | 'defender' = sim.settle.defenseUpgrade > 0 ? 'dealer' : 'defender';

  return {
    roundNumber: sim.tricks.length,
    dealer: state.dealer,
    trumpSuit: state.ctx?.trumpSuit || null,
    dealerTeamScore: sim.dealerTeamScore,
    defenderTeamScore: sim.defenderTeamScore,
    winner,
    nextDealer: sim.postRoundState.nextDealer,
    teamLevelsBefore: { eastWest: eastWestLevel, northSouth: northSouthLevel },
    teamLevelsAfter: sim.postRoundState.nextTeamLevels,
    defenseUpgrade: sim.settle.defenseUpgrade,
    attackUpgrade: sim.settle.attackUpgrade,
    jDemotion: sim.settle.jDemotion
  };
}

/**
 * Run multiple rounds until a team reaches A or max games reached
 */
function runMultiRoundGame(
  startLevel: Rank = '2',
  maxGames: number = 100,
  baseSeed: number = 42,
  verbose: boolean = false
): MultiRoundResult {
  const games: GameResult[] = [];
  let teamLevels: { eastWest: Rank; northSouth: Rank } = { eastWest: startLevel, northSouth: startLevel };
  let dealer: Seat = 'east';
  let victory = false;
  let winningTeam: 'eastWest' | 'northSouth' | null = null;
  let jDemotionCount = 0;
  let maxLevelReached = { eastWest: startLevel, northSouth: startLevel };

  const allLevels: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'AA'];

  for (let i = 0; i < maxGames; i++) {
    const seed = baseSeed + i * 1000;
    
    if (verbose) {
      console.log(`\n=== Game ${i + 1} ===`);
      console.log(`Dealer: ${dealer}, EW Level: ${teamLevels.eastWest}, NS Level: ${teamLevels.northSouth}`);
    }

    const result = runSingleGame(teamLevels.eastWest, teamLevels.northSouth, dealer, seed);
    games.push(result);

    if (result.jDemotion) {
      jDemotionCount++;
      if (verbose) {
        console.log(`  ⚠️ J-demotion triggered!`);
      }
    }

    // Update levels
    teamLevels = result.teamLevelsAfter;
    dealer = result.nextDealer;

    // Track max level reached (now includes AA)
    const ewIdx = allLevels.indexOf(teamLevels.eastWest);
    const nsIdx = allLevels.indexOf(teamLevels.northSouth);
    const maxEwIdx = allLevels.indexOf(maxLevelReached.eastWest);
    const maxNsIdx = allLevels.indexOf(maxLevelReached.northSouth);
    
    if (ewIdx > maxEwIdx) maxLevelReached.eastWest = teamLevels.eastWest;
    if (nsIdx > maxNsIdx) maxLevelReached.northSouth = teamLevels.northSouth;

    if (verbose) {
      console.log(`  Winner: ${result.winner}, Score: Dealer=${result.dealerTeamScore}, Defender=${result.defenderTeamScore}`);
      console.log(`  Next Dealer: ${result.nextDealer}, New Levels: EW=${teamLevels.eastWest}, NS=${teamLevels.northSouth}`);
    }

    // Check for victory (team went past A to AA)
    if (teamLevels.eastWest === 'AA') {
      victory = true;
      winningTeam = 'eastWest';
      if (verbose) {
        console.log(`\n🎉 East-West team passed A and wins!`);
      }
      break;
    }
    if (teamLevels.northSouth === 'AA') {
      victory = true;
      winningTeam = 'northSouth';
      if (verbose) {
        console.log(`\n🎉 North-South team passed A and wins!`);
      }
      break;
    }
  }

  return {
    totalGames: games.length,
    victory,
    winningTeam,
    games,
    finalLevels: teamLevels,
    jDemotionCount,
    maxLevelReached
  };
}

/**
 * Get level index for comparison
 */
function getLevelIndex(level: Rank): number {
  const levels: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'AA'];
  return levels.indexOf(level);
}

/**
 * Get all levels array
 */
function getAllLevels(): Rank[] {
  return ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'AA'];
}

/**
 * Check if a team has won (past A)
 */
function isVictory(level: Rank): boolean {
  return level === 'AA';
}

describe('Multi-Round Game Progression: 2 to A', () => {
  
  test('should run single game successfully', () => {
    const result = runSingleGame('2', '2', 'east', 42);
    
    // A complete game should have at least 10 tricks played
    expect(result.roundNumber).toBeGreaterThan(10);
    expect(result.roundNumber).toBeLessThanOrEqual(39);
    expect(result.dealer).toBe('east');
    expect(['dealer', 'defender']).toContain(result.winner);
    expect(['east', 'north', 'west', 'south']).toContain(result.nextDealer);
    expect(result.teamLevelsBefore.eastWest).toBe('2');
    expect(result.teamLevelsBefore.northSouth).toBe('2');
    // Verify levels changed correctly
    expect(result.teamLevelsAfter).toBeDefined();
  });

  test('should progress levels over multiple games', () => {
    const result = runMultiRoundGame('2', 20, 12345, false);
    
    expect(result.totalGames).toBeGreaterThan(0);
    expect(result.totalGames).toBeLessThanOrEqual(20);
    
    // Either a team won, or we reached max games with some progress
    if (!result.victory) {
      // Should have made some progress from 2
      const madeProgress = 
        getLevelIndex(result.maxLevelReached.eastWest) > 0 ||
        getLevelIndex(result.maxLevelReached.northSouth) > 0;
      expect(madeProgress).toBe(true);
    }
  });

  test('should correctly rotate dealer after each game', () => {
    const result = runMultiRoundGame('2', 10, 54321, false);
    
    // Check that dealer rotation is consistent
    for (let i = 0; i < result.games.length - 1; i++) {
      const currentGame = result.games[i];
      const nextGame = result.games[i + 1];
      
      // Next game's dealer should match current game's nextDealer
      expect(nextGame.dealer).toBe(currentGame.nextDealer);
    }
  });

  test('should track team levels correctly across games', () => {
    const result = runMultiRoundGame('2', 15, 11111, false);
    
    // Verify level continuity
    for (let i = 0; i < result.games.length - 1; i++) {
      const currentGame = result.games[i];
      const nextGame = result.games[i + 1];
      
      // Next game's starting levels should match current game's ending levels
      expect(nextGame.teamLevelsBefore.eastWest).toBe(currentGame.teamLevelsAfter.eastWest);
      expect(nextGame.teamLevelsBefore.northSouth).toBe(currentGame.teamLevelsAfter.northSouth);
    }
  });

  test('should reach victory within reasonable number of games', () => {
    // Run multiple attempts to ensure at least one reaches AA
    let victories = 0;
    const attempts = 5;
    
    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = runMultiRoundGame('2', 100, 99999 + attempt * 10000, false);
      if (result.victory) {
        victories++;
        // Verify winning team reached AA (past A)
        if (result.winningTeam === 'eastWest') {
          expect(result.finalLevels.eastWest).toBe('AA');
        } else {
          expect(result.finalLevels.northSouth).toBe('AA');
        }
      }
    }
    
    // At least one attempt should reach victory within 100 games
    expect(victories).toBeGreaterThan(0);
  });

  test('should handle J-demotion correctly in multi-round context', () => {
    // Run enough games to potentially trigger J-demotion
    const result = runMultiRoundGame('2', 50, 77777, false);
    
    // If J-demotion occurred, dealer team resets to 2, then may still upgrade in same round
    for (const game of result.games) {
      if (game.jDemotion) {
        const dealerTeam = (game.dealer === 'east' || game.dealer === 'west') ? 'eastWest' : 'northSouth';
        const expected = applyUpgrade('2', game.defenseUpgrade);
        expect(game.teamLevelsAfter[dealerTeam]).toBe(expected);
      }
    }
  });

  test('should correctly apply upgrade amounts based on score', () => {
    const result = runMultiRoundGame('2', 30, 33333, false);
    
    for (const game of result.games) {
      const score = game.defenderTeamScore;
      
      // Verify upgrade amounts match scoring rules
      if (score === 0) {
        expect(game.defenseUpgrade).toBe(3);
        expect(game.attackUpgrade).toBe(0);
      } else if (score <= 55) {
        expect(game.defenseUpgrade).toBe(2);
        expect(game.attackUpgrade).toBe(0);
      } else if (score <= 115) {
        expect(game.defenseUpgrade).toBe(1);
        expect(game.attackUpgrade).toBe(0);
      } else if (score <= 175) {
        expect(game.defenseUpgrade).toBe(0);
        expect(game.attackUpgrade).toBe(0);
      } else if (score <= 235) {
        expect(game.defenseUpgrade).toBe(0);
        expect(game.attackUpgrade).toBe(1);
      } else if (score <= 295) {
        expect(game.defenseUpgrade).toBe(0);
        expect(game.attackUpgrade).toBe(2);
      } else {
        expect(game.defenseUpgrade).toBe(0);
        expect(game.attackUpgrade).toBe(3);
      }
    }
  });

  test('should respect mandatory levels (2, 5, 10, J, K)', () => {
    // First, test applyUpgrade directly
    const { applyUpgrade } = require('../src/core/scoring');
    
    // Case 1: Level 2 + 3 upgrade should stop at 5 (mandatory)
    expect(applyUpgrade('2', 3)).toBe('5');
    
    // Case 2: Level 3 + 3 upgrade should stop at 5 (mandatory)
    expect(applyUpgrade('3', 3)).toBe('5');
    
    // Case 3: Level 4 + 3 upgrade should stop at 5 (mandatory)
    expect(applyUpgrade('4', 3)).toBe('5');
    
    // Case 4: Level 6 + 5 upgrade should stop at 10 (mandatory)
    expect(applyUpgrade('6', 5)).toBe('10');
    
    // Case 5: Level 9 + 4 upgrade should stop at 10, then J (mandatory levels in sequence)
    // Actually this tests a single upgrade - 9 + 4 = 13 (A), but should stop at 10 first
    expect(applyUpgrade('9', 4)).toBe('10');
    
    // Case 6: Level Q + 2 upgrade should stop at K (mandatory)
    expect(applyUpgrade('Q', 2)).toBe('K');
    
    // Case 7: Level 2 + 1 upgrade should go to 3 (no mandatory level skipped)
    expect(applyUpgrade('2', 1)).toBe('3');
    
    // Case 8: Level 5 + 1 upgrade should go to 6 (no mandatory level skipped)
    expect(applyUpgrade('5', 1)).toBe('6');
    
    // Case 9: Level 3 + 2 upgrade should go to 5 (stops at mandatory)
    expect(applyUpgrade('3', 2)).toBe('5');
    
    // Case 10: Level 7 + 3 upgrade should stop at 10 (mandatory)
    expect(applyUpgrade('7', 3)).toBe('10');
    
    // Case 11: Level 10 + 2 upgrade should stop at J (mandatory)
    expect(applyUpgrade('10', 2)).toBe('J');
    
    // Case 12: Level J + 2 upgrade should stop at K (mandatory)
    // J is index 9, K is index 11, Q is index 10 (not mandatory)
    // So J + 2 = K, and K is mandatory, so result is K
    expect(applyUpgrade('J', 2)).toBe('K');
    
    // Now test in multi-round context - find cases where upgrade > 1
    const result = runMultiRoundGame('2', 50, 55555, false);
    
    const mandatoryLevels: Rank[] = ['2', '5', '10', 'J', 'K'];
    const allLevelsArr = getAllLevels();
    
    // Track all multi-level jumps for debugging
    const multiLevelJumps: Array<{
      game: number;
      team: string;
      from: Rank;
      to: Rank;
      jump: number;
      mandatorySkipped: Rank[];
    }> = [];
    
    // Check each game for multi-level upgrades
    for (let i = 0; i < result.games.length; i++) {
      const game = result.games[i];
      const beforeEw = game.teamLevelsBefore.eastWest;
      const afterEw = game.teamLevelsAfter.eastWest;
      const beforeNs = game.teamLevelsBefore.northSouth;
      const afterNs = game.teamLevelsAfter.northSouth;
      
      const ewDiff = getLevelIndex(afterEw) - getLevelIndex(beforeEw);
      const nsDiff = getLevelIndex(afterNs) - getLevelIndex(beforeNs);
      
      // If EW upgraded by more than 1, verify they stopped at mandatory level
      if (ewDiff > 1) {
        const startIndex = getLevelIndex(beforeEw);
        const endIndex = getLevelIndex(afterEw);
        
        const skippedMandatory: Rank[] = [];
        for (let j = startIndex + 1; j < endIndex; j++) {
          if (mandatoryLevels.includes(allLevelsArr[j])) {
            skippedMandatory.push(allLevelsArr[j]);
          }
        }
        
        multiLevelJumps.push({
          game: i + 1,
          team: 'EW',
          from: beforeEw,
          to: afterEw,
          jump: ewDiff,
          mandatorySkipped: skippedMandatory
        });
        
        // If mandatory levels were skipped, this is a BUG
        if (skippedMandatory.length > 0) {
          console.log(`BUG: Game ${i + 1}, EW jumped from ${beforeEw} to ${afterEw}, skipped mandatory levels: ${skippedMandatory.join(', ')}`);
        }
        expect(skippedMandatory.length).toBe(0);
      }
      
      // Same check for NS
      if (nsDiff > 1) {
        const startIndex = getLevelIndex(beforeNs);
        const endIndex = getLevelIndex(afterNs);
        
        const skippedMandatory: Rank[] = [];
        for (let j = startIndex + 1; j < endIndex; j++) {
          if (mandatoryLevels.includes(allLevelsArr[j])) {
            skippedMandatory.push(allLevelsArr[j]);
          }
        }
        
        multiLevelJumps.push({
          game: i + 1,
          team: 'NS',
          from: beforeNs,
          to: afterNs,
          jump: nsDiff,
          mandatorySkipped: skippedMandatory
        });
        
        if (skippedMandatory.length > 0) {
          console.log(`BUG: Game ${i + 1}, NS jumped from ${beforeNs} to ${afterNs}, skipped mandatory levels: ${skippedMandatory.join(', ')}`);
        }
        expect(skippedMandatory.length).toBe(0);
      }
    }
    
    // Print all multi-level jumps for visibility
    if (multiLevelJumps.length > 0) {
      console.log('\n=== Multi-level jumps detected ===');
      for (const jump of multiLevelJumps) {
        console.log(`Game ${jump.game}: ${jump.team} jumped ${jump.from} → ${jump.to} (${jump.jump} levels)`);
        if (jump.mandatorySkipped.length > 0) {
          console.log(`  ⚠️ SKIPPED mandatory: ${jump.mandatorySkipped.join(', ')}`);
        } else {
          console.log(`  ✓ No mandatory levels skipped`);
        }
      }
    } else {
      console.log('\nNo multi-level jumps detected in this simulation');
    }
  });

  test('should start from mid-level correctly', () => {
    // Start from J level
    const result = runMultiRoundGame('J', 50, 88888, false);
    
    expect(result.games[0].teamLevelsBefore.eastWest).toBe('J');
    expect(result.games[0].teamLevelsBefore.northSouth).toBe('J');
    
    // Should be able to progress to A within 50 games
    // (J -> Q -> K -> A is only 3 steps if no demotion)
    const reachedAorClose = 
      result.victory || 
      getLevelIndex(result.maxLevelReached.eastWest) >= getLevelIndex('K') ||
      getLevelIndex(result.maxLevelReached.northSouth) >= getLevelIndex('K');
    
    expect(reachedAorClose).toBe(true);
  });

  test('full game simulation: 2 to A with verbose output', () => {
    // This test runs the full simulation with verbose output
    const result = runMultiRoundGame('2', 100, 123, true);
    
    console.log('\n=== Multi-Round Simulation Summary ===');
    console.log(`Total games: ${result.totalGames}`);
    console.log(`Victory: ${result.victory}`);
    console.log(`Winning team: ${result.winningTeam || 'N/A'}`);
    console.log(`Final levels: EW=${result.finalLevels.eastWest}, NS=${result.finalLevels.northSouth}`);
    console.log(`Max levels reached: EW=${result.maxLevelReached.eastWest}, NS=${result.maxLevelReached.northSouth}`);
    console.log(`J-demotion count: ${result.jDemotionCount}`);
    
    // Count wins by team
    let dealerWins = 0;
    let defenderWins = 0;
    for (const game of result.games) {
      if (game.winner === 'dealer') dealerWins++;
      else defenderWins++;
    }
    console.log(`Dealer wins: ${dealerWins}, Defender wins: ${defenderWins}`);
    
    expect(result.totalGames).toBeGreaterThan(0);
  });

  test('stress test: run multiple full simulations', () => {
    // Run multiple independent simulations
    const simulations = 3;
    const results: MultiRoundResult[] = [];
    
    for (let i = 0; i < simulations; i++) {
      const result = runMultiRoundGame('2', 100, 1000000 + i * 500000, false);
      results.push(result);
    }
    
    console.log('\n=== Stress Test Results ===');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`Simulation ${i + 1}: ${r.totalGames} games, Victory: ${r.victory}, Winner: ${r.winningTeam || 'N/A'}`);
    }
    
    // At least half should reach victory within 100 games
    const victoryCount = results.filter(r => r.victory).length;
    expect(victoryCount).toBeGreaterThanOrEqual(Math.floor(simulations / 2));
  });
});

console.log('✓ Multi-round game tests defined');
