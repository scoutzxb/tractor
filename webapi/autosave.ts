import * as fs from 'fs';
import * as path from 'path';
import type { Seat } from '../src/core/types';
import type { Session } from '../web-deal-service';
import { serializeSession } from './routes/save-game';
import { deserializeSession } from './session-utils';

const AUTOSAVE_ROOT = path.join(process.cwd(), 'autosaves');
const PLAYER_MODES: Array<'single' | 'two'> = ['single', 'two'];

function ensureAutosaveRoot() {
  if (!fs.existsSync(AUTOSAVE_ROOT)) {
    fs.mkdirSync(AUTOSAVE_ROOT, { recursive: true });
  }
}

function sanitizePlayerName(name: string): string {
  if (!name) return 'player';
  return name.trim().replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 64) || 'player';
}

function getPlayerDir(name: string) {
  ensureAutosaveRoot();
  const sanitized = sanitizePlayerName(name);
  const dir = path.join(AUTOSAVE_ROOT, sanitized);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getAutosavePath(name: string, mode: 'single' | 'two') {
  return path.join(getPlayerDir(name), `${mode}.json`);
}

export type AutosaveMetadata = {
  playerName: string;
  playerSeat: Seat;
  playerMode: 'single' | 'two';
  phase: Session['phase'];
  updatedAt: string;
};

type AutosaveFile = {
  metadata: AutosaveMetadata;
  session: any;
};

function shouldAutoSave(session: Session) {
  return session.phase !== 'waiting' && session.phase !== 'dealing';
}

export function autoSaveForSeat(session: Session, seat: Seat) {
  if (!shouldAutoSave(session)) return;
  const player = session.players.get(seat);
  if (!player || !player.name) return;
  const playerMode = session.playerMode === 'two' ? 'two' : 'single';
  const filePath = getAutosavePath(player.name, playerMode);
  const payload: AutosaveFile = {
    metadata: {
      playerName: player.name,
      playerSeat: seat,
      playerMode,
      phase: session.phase,
      updatedAt: new Date().toISOString(),
    },
    session: serializeSession(session),
  };
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Failed to write autosave', error);
  }
}

export function autoSaveForAllPlayers(session: Session) {
  if (!shouldAutoSave(session)) return;
  for (const seat of session.players.keys()) {
    autoSaveForSeat(session, seat as Seat);
  }
}

export function listPlayerAutosaves(playerName: string) {
  if (!playerName) return [];
  const dir = path.join(AUTOSAVE_ROOT, sanitizePlayerName(playerName));
  if (!fs.existsSync(dir)) return [];
  const entries: AutosaveMetadata[] = [];
  for (const mode of PLAYER_MODES) {
    const filePath = path.join(dir, `${mode}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const payload: AutosaveFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (payload?.metadata) {
        entries.push(payload.metadata);
      }
    } catch {
      // ignore corrupt files
    }
  }
  return entries;
}

export function readPlayerAutosave(playerName: string, playerMode: 'single' | 'two'): AutosaveFile | null {
  if (!playerName) return null;
  const filePath = path.join(AUTOSAVE_ROOT, sanitizePlayerName(playerName), `${playerMode}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const payload: AutosaveFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return payload;
  } catch (error) {
    console.error('Failed to read autosave file', error);
    return null;
  }
}

export async function handleAutosaveList(req: Request, deps: any) {
  const { json } = deps;
  const { playerName } = await req.json();
  return json({ ok: true, saves: listPlayerAutosaves(playerName) });
}

export async function handleAutosaveLoad(req: Request, deps: any) {
  const { sessions, json, summarize } = deps;
  const { playerName, playerMode } = await req.json();

  if (!playerName || !playerMode) {
    return json({ error: 'playerName and playerMode are required' }, 400);
  }

  const payload = readPlayerAutosave(playerName, playerMode);
  if (!payload) {
    return json({ error: 'Autosave not found' }, 404);
  }

  const session = deserializeSession(payload.session, deps);
  const seat = payload.metadata.playerSeat;
  const savedPlayer = session.players.get(seat);
  const token = savedPlayer?.token || deps.generateToken();
  if (savedPlayer && savedPlayer.token !== token) {
    session.players.set(seat, {
      ...savedPlayer,
      token,
      lastSeen: new Date(),
      connectedAt: new Date(),
    });
  }

  sessions.set(session.id, session);

  return json({
    ok: true,
    sessionId: session.id,
    playerSeat: seat,
    playerToken: token,
    playerMode: payload.metadata.playerMode,
    state: summarize(session, seat),
    message: `已恢复自动存档: ${playerMode}`,
  });
}
