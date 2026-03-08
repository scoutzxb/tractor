import { followCardsStrategy } from './src/ai/play-strategy';
const c=(s:string,r:string,id:number)=>({id,suit:s,rank:r} as any);
const ctx={level:'2',trumpSuit:'heart'} as any;
const hand=[c('diamond','2',201),c('heart','10',202),c('heart','10',203),c('heart','9',204),c('heart','9',205),c('heart','6',206),c('heart','6',207),c('heart','5',208),c('heart','5',209),c('club','A',210),c('diamond','A',211),c('diamond','J',212),{id:213,joker:'big'},{id:214,joker:'big'},{id:215,joker:'small'},{id:216,joker:'small'}] as any;
const lead=[c('heart','3',300),c('heart','3',301),c('heart','3',302)] as any;
const current=[{seat:'north',cards:lead},{seat:'west',cards:[c('club','2',303),c('club','2',304),c('diamond','2',305)]}] as any;
const play=followCardsStrategy(hand,lead,current,'south' as any,ctx);
console.log(play.map((x:any)=>x.joker?x.joker:`${x.suit}${x.rank}`).join(' '));
