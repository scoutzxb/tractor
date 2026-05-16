import * as fs from 'fs';
import * as path from 'path';
import type { Session } from '../web-deal-service';

const SAVES_DIR = path.join(process.cwd(), 'saves');

// Ensure saves directory exists
if (!fs.existsSync(SAVES_DIR)) {
  fs.mkdirSync(SAVES_DIR, { recursive: true });
}

export function serializeSession(session: Session): any {
  return {
    id: session.id,
    round: session.round,
    done: session.done,
    phase: session.phase,
    awaitingDiscard: session.awaitingDiscard,
    pendingChaodiSettle: session.pendingChaodiSettle,
    mode: session.mode,
    isGrabMode: session.isGrabMode,
    configuredLevel: session.configuredLevel,
    configuredDealer: session.configuredDealer,
    humanSeats: [...session.humanSeats],
    playerMode: session.playerMode,
    isMultiplayer: session.isMultiplayer,
    teamLevels: session.teamLevels,
    exemptions: session.exemptions,
    lastLogIndex: session.lastLogIndex,
    currentLeader: session.currentLeader,
    currentTrick: session.currentTrick,
    roundNumber: session.roundNumber,
    scores: Object.fromEntries(session.scores),
    tricks: session.tricks,
    waitingNextRound: session.waitingNextRound,
    lastRoundReview: session.lastRoundReview,
    gameResult: session.gameResult,
    dealingCardsLog: session.dealingCardsLog.map((log: any) => ({
      round: log.round,
      cardsBySeat: Object.fromEntries(log.cardsBySeat),
      declarations: log.declarations
    })),
    players: Object.fromEntries([...session.players.entries()].map(([seat, p]: [any, any]) => [
      seat,
      {
        token: p.token,
        name: p.name,
        connectedAt: p.connectedAt,
        lastSeen: p.lastSeen
      }
    ])),
    hostSeat: session.hostSeat,
    nextSessionId: session.nextSessionId,
    loggedTeamLevels: session.loggedTeamLevels,
    loggerState: session.logger?.exportState ? session.logger.exportState() : null,
    engineState: session.engine.getSerializableState(),
    savedAt: new Date().toISOString()
  };
}

export async function handleSaveGame(req: Request, deps: any) {
  const { sessions, json } = deps;
  const { sessionId, saveName, playerSeat, playerToken } = await req.json();
  
  const session = sessions.get(sessionId);
  if (!session) {
    return json({ error: 'Session not found' }, 404);
  }
  const authError = deps.requirePlayerAuth?.(session, playerSeat, playerToken);
  if (authError) return json({ error: authError }, 403);
  
  const serialized = serializeSession(session);
  const filename = saveName || `save_${sessionId}_${Date.now()}.json`;
  const filepath = path.join(SAVES_DIR, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(serialized, null, 2));
  
  return json({ 
    ok: true, 
    filename,
    savedAt: serialized.savedAt,
    message: `游戏已保存: ${filename}`
  });
}

export async function handleListSaves(req: Request, deps: any) {
  const { json } = deps;
  
  if (!fs.existsSync(SAVES_DIR)) {
    return json({ saves: [] });
  }
  
  const files = fs.readdirSync(SAVES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const filepath = path.join(SAVES_DIR, f);
      try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        return {
          filename: f,
          sessionId: content.id,
          phase: content.phase,
          playerMode: content.playerMode,
          level: content.engineState?.level,
          dealer: content.engineState?.dealer,
          roundNumber: content.roundNumber,
          savedAt: content.savedAt,
          hasTrump: !!content.engineState?.trumpState?.currentTrump
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  
  return json({ ok: true, saves: files });
}

export async function handleDeleteSave(req: Request, deps: any) {
  const { json } = deps;
  const { filename, sessionId, playerSeat, playerToken } = await req.json();
  
  if (sessionId) {
    const session = deps.sessions?.get(sessionId);
    if (session) {
      const authError = deps.requirePlayerAuth?.(session, playerSeat, playerToken);
      if (authError) return json({ error: authError }, 403);
    }
  }
  const filepath = path.join(SAVES_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    return json({ error: 'Save file not found' }, 404);
  }
  
  fs.unlinkSync(filepath);
  
  return json({ ok: true, message: `存档已删除: ${filename}` });
}
