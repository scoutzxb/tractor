import { isTrump } from './src/core/deck';
import type { Card, GameContext } from './src/core/types';

const ctx: GameContext = { level: '2', trumpSuit: null };
const card: Card = { id: 0, suit: 'diamond', rank: '2' };

console.log('Context:', ctx);
console.log('Card:', card);
console.log('isTrump:', isTrump(card, ctx));
