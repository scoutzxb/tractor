import * as fs from 'fs';
import * as path from 'path';
import { createGameEngine } from '../../src/engine/game-loop';
import { SimpleAI } from '../../src/ai/simple-player';
import type { Seat, Rank } from '../../src/core/types';

const SAVES_DIR = path.join(process.cwd(), 'saves');

function deserializeSession(serialized: any, deps: any): any {
  const { createGameEngine, SimpleAI, makeHumanProxy } = deps;
  
  // Create new engine with saved settings
  const engine = createGameEngine(
    serialized.engineState.level,
    serialized.engineState.dealer,
    serialized.isGrabMode,
    Date.now()
  );
  
  // Restore engine state
  engine.restoreState(serialized.engineState);
  
  // Re-register players based on saved mode
  const humanSeats = new Set<Seat>(serialized.humanSeats);
  
  engine.registerPlayer(new SimpleAI('east', '东'));
  engine.registerPlayer(humanSeats.has('north') ? makeHumanProxy('north') : new SimpleAI('north', '北'));
  engine.registerPlayer(new SimpleAI('west', '西'));
  engine.registerPlayer(humanSeats.has('south') ? makeHumanProxy('south') : new SimpleAI('south', '南'));
  
  // Rebuild session
  const session = {
    id: serialized.id,
    engine,
    deck: [],
    round: serialized.round,
    done: serialized.done,
    phase: serialized.phase,
    awaitingDiscard: serialized.awaitingDiscard,
    pendingChaodiSettle: serialized.pendingChaodiSettle,
    mode: serialized.mode,
    isGrabMode: serialized.isGrabMode,
    configuredLevel: serialized.configuredLevel,
    configuredDealer: serialized.configuredDealer,
    humanSeats,
    playerMode: serialized.playerMode,
    isMultiplayer: serialized.isMultiplayer,
    teamLevels: serialized.teamLevels,
    exemptions: serialized.exemptions,
    lastLogIndex: serialized.lastLogIndex,
    currentLeader: serialized.currentLeader,
    currentTrick: serialized.currentTrick,
    roundNumber: serialized.roundNumber,
    scores: new Map(Object.entries(serialized.scores)),
    tricks: serialized.tricks,
    waitingNextRound: serialized.waitingNextRound,
    lastRoundReview: serialized.lastRoundReview,
    gameResult: serialized.gameResult,
    logger: deps.getLoggerManager('game-logs-web').startNewGame(),
    dealingCardsLog: serialized.dealingCardsLog.map((log: any) => ({
      round: log.round,
      cardsBySeat: new Map(Object.entries(log.cardsBySeat)),
      declarations: log.declarations
    })),
    players: new Map(Object.entries(serialized.players || {}).map(([seat, p]: [string, any]) => [
      seat,
      {
        token: p.token,
        name: p.name,
        connectedAt: new Date(p.connectedAt),
        lastSeen: new Date(p.lastSeen)
      }
    ]))
  };
  
  return session;
}

export async function handleLoadGame(req: Request, deps: any) {
  const { sessions, json, summarize } = deps;
  const { filename, desiredSeat, playerToken } = await req.json();
  
  const filepath = path.join(SAVES_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    return json({ error: 'Save file not found' }, 404);
  }
  
  try {
    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    const session = deserializeSession(content, deps);
    
    // Verify player access
    const savedPlayer = session.players.get(desiredSeat);
    if (savedPlayer && savedPlayer.token !== playerToken) {
      // Token mismatch - create new player entry for this seat
      if (session.humanSeats.has(desiredSeat)) {
        const { generateToken } = deps;
        const newToken = generateToken();
        session.players.set(desiredSeat, {
          token: newToken,
          name: savedPlayer.name,
          connectedAt: new Date(),
          lastSeen: new Date()
        });
        // Return with new token
        sessions.set(session.id, session);
        return json({
          ok: true,
          sessionId: session.id,
          playerToken: newToken,
          playerSeat: desiredSeat,
          state: summarize(session, desiredSeat),
          message: `游戏已加载: ${filename}`
        });
      }
    }
    
    sessions.set(session.id, session);
    
    return json({
      ok: true,
      sessionId: session.id,
      playerToken: savedPlayer?.token || playerToken,
      playerSeat: desiredSeat,
      state: summarize(session, desiredSeat),
      message: `游戏已加载: ${filename}`
    });
  } catch (error: any) {
    return json({ error: `Failed to load save: ${error.message}` }, 500);
  }
}

export async function handleQuickLoad(req: Request, deps: any) {
  const { sessions, json, summarize } = deps;
  const { desiredSeat } = await req.json();
  
  if (!fs.existsSync(SAVES_DIR)) {
    return json({ error: 'No saves found' }, 404);
  }
  
  const files = fs.readdirSync(SAVES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const filepath = path.join(SAVES_DIR, f);
      try {
        const stat = fs.statSync(filepath);
        return { filename: f, mtime: stat.mtime };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime());
  
  if (files.length === 0) {
    return json({ error: 'No saves found' }, 404);
  }
  
  // Load the most recent save
  const latest = files[0] as { filename: string };
  const filepath = path.join(SAVES_DIR, latest.filename);
  
  try {
    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    const session = deserializeSession(content, deps);
    
    const seat = desiredSeat || 'south';
    const savedPlayer = session.players.get(seat);
    
    sessions.set(session.id, session);
    
    return json({
      ok: true,
      sessionId: session.id,
      playerToken: savedPlayer?.token || '',
      playerSeat: seat,
      state: summarize(session, seat),
      message: `已加载最新存档: ${latest.filename}`
    });
  } catch (error: any) {
    return json({ error: `Failed to load save: ${error.message}` }, 500);
  }
}
