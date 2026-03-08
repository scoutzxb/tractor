import { followCardsStrategy, getWinningPlay } from './src/ai/play-strategy';
import type { Card, GameContext, Seat } from './src/core/types';

const c=(s:'spade'|'heart'|'club'|'diamond', r:string, id:number):Card=>({id,suit:s,rank:r} as Card);
const j=(k:'big'|'small',id:number):Card=>({id,joker:k} as Card);

const ctx: GameContext = { level:'5', trumpSuit:'club' };

const east: Card[] = [
  j('big',1), j('big',2), j('small',3), j('small',4),
  c('club','5',5), c('club','5',6), c('club','5',7), c('diamond','5',8),
  c('club','K',9), c('club','8',10), c('club','8',11), c('club','7',12), c('club','6',13), c('club','4',14), c('club','4',15), c('club','3',16), c('club','2',17),
  c('spade','K',18), c('spade','K',19), c('spade','Q',20), c('spade','J',21), c('spade','9',22), c('spade','8',23),
  c('heart','A',24), c('heart','K',25), c('heart','K',26), c('heart','Q',27), c('heart','J',28), c('heart','10',29),
  c('diamond','A',30), c('diamond','Q',31), c('diamond','9',32), c('diamond','9',33), c('diamond','8',34), c('diamond','8',35), c('diamond','7',36), c('diamond','4',37), c('diamond','4',38), c('diamond','4',39)
];

const lead = [c('heart','4',100), c('heart','4',101), c('heart','3',102), c('heart','3',103)];
const westPlay = [c('heart','2',110), c('heart','2',111), c('heart','9',112), c('heart','9',113)];
const southPlay = [c('heart','8',120), c('heart','8',121), c('heart','7',122), c('heart','7',123)];

const current = [
  {seat:'north' as Seat, cards: lead},
  {seat:'west' as Seat, cards: westPlay},
  {seat:'south' as Seat, cards: southPlay},
];

const winner = getWinningPlay(current, ctx);
console.log('winner before east:', winner.seat, winner.cards.map(x=>`${x.suit}${x.rank}`).join(' '));

const play = followCardsStrategy(east, lead, current, 'east', ctx);
console.log('east chosen:', play.map(x=>x.joker?x.joker:`${x.suit}${x.rank}`).join(' '));
