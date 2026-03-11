import * as fs from 'fs';
import * as path from 'path';
import { deserializeSession } from '../session-utils';
import type { Seat } from '../../src/core/types';
import { readPlayerAutosave } from '../autosave';

const SAVES_DIR = path.join(process.cwd(), 'saves');
const AUTOSAVES_DIR = path.join(process.cwd(), 'autosaves');

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
  
  const candidates: Array<{ type: 'manual' | 'autosave'; filepath: string; mtime: Date; playerName?: string; playerMode?: 'single' | 'two' }> = [];
  
  // Check manual saves
  if (fs.existsSync(SAVES_DIR)) {
    const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const filepath = path.join(SAVES_DIR, f);
      try {
        const stat = fs.statSync(filepath);
        candidates.push({ type: 'manual', filepath, mtime: stat.mtime });
      } catch {
        // ignore
      }
    }
  }
  
  // Check autosaves - look for all player directories
  if (fs.existsSync(AUTOSAVES_DIR)) {
    const playerDirs = fs.readdirSync(AUTOSAVES_DIR).filter(d => {
      const fullPath = path.join(AUTOSAVES_DIR, d);
      return fs.statSync(fullPath).isDirectory();
    });
    
    for (const playerDir of playerDirs) {
      for (const mode of ['single', 'two'] as const) {
        const filepath = path.join(AUTOSAVES_DIR, playerDir, `${mode}.json`);
        if (fs.existsSync(filepath)) {
          try {
            const stat = fs.statSync(filepath);
            candidates.push({ 
              type: 'autosave', 
              filepath, 
              mtime: stat.mtime,
              playerName: playerDir,
              playerMode: mode
            });
          } catch {
            // ignore
          }
        }
      }
    }
  }
  
  if (candidates.length === 0) {
    return json({ error: 'No saves found' }, 404);
  }
  
  // Sort by mtime descending and pick the most recent
  candidates.sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime());
  const latest = candidates[0];
  
  try {
    let content: any;
    let session: any;
    
    if (latest.type === 'autosave') {
      // Load autosave format (has metadata wrapper)
      const payload = JSON.parse(fs.readFileSync(latest.filepath, 'utf-8'));
      content = payload.session;
      session = deserializeSession(content, deps);
    } else {
      // Load manual save format
      content = JSON.parse(fs.readFileSync(latest.filepath, 'utf-8'));
      session = deserializeSession(content, deps);
    }
    
    const seat = desiredSeat || 'south';
    const savedPlayer = session.players.get(seat);
    
    sessions.set(session.id, session);
    
    const message = latest.type === 'autosave' 
      ? `已恢复自动存档 (${latest.playerName} - ${latest.playerMode})`
      : `已加载最新存档: ${path.basename(latest.filepath)}`;
    
    return json({
      ok: true,
      sessionId: session.id,
      playerToken: savedPlayer?.token || '',
      playerSeat: seat,
      state: summarize(session, seat),
      message
    });
  } catch (error: any) {
    return json({ error: `Failed to load save: ${error.message}` }, 500);
  }
}
