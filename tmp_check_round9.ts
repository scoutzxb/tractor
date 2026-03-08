import { getWinningPlay } from './src/core/trick-judge';
import { followCardsStrategy } from './src/ai/play-strategy';
import type { Card, GameContext, Seat } from './src/core/types';

const c = (suit: 'spade'|'heart'|'club'|'diamond', rank: string, id: number): Card => ({id,suit,rank} as Card);
const ctx: GameContext = { level: '2', trumpSuit: 'heart' };

const lead = [c('heart','3',1),c('heart','3',2),c('heart','3',3)];
const west = [c('club','2',4),c('club','2',5),c('diamond','2',6)];

const current = [
  { seat:'north' as Seat, cards: lead },
  { seat:'west' as Seat, cards: west }
];

const win = getWinningPlay(current, ctx);
console.log('current winner:', win.seat, win.cards.map(x=>`${x.suit}${x.rank}`).join(' '));

const southHand: Card[] = [
  c('joker' as any,'big' as any,100), c('joker' as any,'big' as any,101), c('joker' as any,'small' as any,102), c('joker' as any,'small' as any,103),
  c('diamond','2',104), c('heart','10',105), c('heart','10',106), c('heart','9',107), c('heart','9',108), c('heart','6',109), c('heart','6',110), c('heart','5',111), c('heart','5',112),
  c('club','A',113), c('diamond','A',114), c('diamond','J',115)
] as any;

const play = followCardsStrategy(southHand, lead, current, 'south', ctx);
console.log('south play:', play.map(x=>`${x.suit}${x.rank}`).join(' '));
