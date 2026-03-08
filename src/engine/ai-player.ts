import type { Seat } from '../core/types';
import type { Player } from './game-loop';
import { SimpleAI } from '../ai/simple-player';

export function createAIPlayer(seat: Seat, name?: string): Player {
  return new SimpleAI(seat, name || `AI-${seat}`);
}
