import { describe, test, expect } from 'bun:test';
import { followCardsStrategy, leadCardsStrategy, setThrowLeadRate, getThrowLeadRate } from '../src/ai/play-strategy';
import type { Card, GameContext, Seat } from '../src/core/types';

const c = (suit: 'spade'|'heart'|'club'|'diamond', rank: string, id: number): Card => ({ id, suit, rank } as Card);

describe('AI strategy v1 baseline', () => {
  const ctx: GameContext = { level: '2', trumpSuit: 'heart' };

  test('opponent-leading two-pair: one-pair fallback should avoid high-point singles', () => {
    const lead = [c('heart','4',500), c('heart','4',501), c('heart','3',502), c('heart','3',503)];
    const current = [
      { seat: 'west' as Seat, cards: [c('heart','2',510), c('heart','2',511), c('heart','9',512), c('heart','9',513)] },
      { seat: 'south' as Seat, cards: [c('heart','8',520), c('heart','8',521), c('heart','7',522), c('heart','7',523)] }
    ];

    const eastHand: Card[] = [
      c('heart','K',530), c('heart','K',531),
      c('heart','J',532), c('heart','10',533), c('heart','6',534), c('heart','4',535),
      c('spade','A',536)
    ];

    const play = followCardsStrategy(eastHand, lead, current, 'east', ctx);
    expect(play.length).toBe(4);

    const ranks = play.map(x => x.rank);
    const kCount = ranks.filter(r => r === 'K').length;
    expect(kCount).toBe(2);

    const highSingles = ranks.filter(r => r === '10' || r === 'J').length;
    expect(highSingles).toBeLessThan(2);
  });

  test('game_004 round8 west: void dump should not consume full ♥3 pair', () => {
    const westHand: Card[] = [
      c('spade','7',401), c('spade','6',402), c('spade','3',403),
      c('heart','K',404), c('heart','Q',405), c('heart','J',406), c('heart','6',407), c('heart','4',408), c('heart','3',409), c('heart','3',410),
      c('diamond','J',411),
      c('spade','5',412),
      c('club','5',413),
      { id: 414, joker: 'small' } as any
    ] as any;

    const lead = [c('club','7',420), c('club','7',421), c('club','6',422), c('club','6',423)];
    const current = [{ seat: 'north' as Seat, cards: lead }];

    const play = followCardsStrategy(westHand, lead, current, 'west', ctx);
    expect(play.length).toBe(4);
    const heart3Count = play.filter(x => x.suit === 'heart' && x.rank === '3').length;
    expect(heart3Count).toBeLessThan(2);
  });

  test('lead priority: longer tractor outranks shorter tractor', () => {
    const hand: Card[] = [
      c('club', 'Q', 1), c('club', 'Q', 2), c('club', 'J', 3), c('club', 'J', 4),
      c('diamond', '8', 5), c('diamond', '8', 6), c('diamond', '7', 7), c('diamond', '7', 8), c('diamond', '6', 9), c('diamond', '6', 10),
      c('spade', 'A', 11)
    ];

    const oldRate = getThrowLeadRate();
    setThrowLeadRate(0);
    const lead = leadCardsStrategy(hand, ctx);
    setThrowLeadRate(oldRate);

    expect(lead.length).toBe(6);
    const sig = lead.map(x => `${x.suit}${x.rank}`).sort();
    expect(sig).toEqual(['diamond6','diamond6','diamond7','diamond7','diamond8','diamond8']);
  });

  test('game_004 round8: should avoid breaking potential tractor and choose 22+2', () => {
    const southRound8: Card[] = [
      c('spade','2',1), c('spade','2',2), c('club','2',3), c('diamond','2',4),
      c('heart','10',5), c('heart','10',6), c('heart','9',7), c('heart','9',8), c('heart','6',9), c('heart','6',10), c('heart','5',11), c('heart','5',12),
      c('joker' as any,'big' as any,13), c('joker' as any,'big' as any,14), c('joker' as any,'small' as any,15), c('joker' as any,'small' as any,16)
    ] as any;

    const lead8 = [c('heart','2',100), c('heart','2',101), c('heart','2',102)];
    const current8 = [
      { seat: 'north' as Seat, cards: lead8 },
      { seat: 'west' as Seat, cards: [c('heart','Q',103), c('heart','A',104), c('heart','A',105)] }
    ];

    const play8 = followCardsStrategy(southRound8, lead8, current8, 'south', ctx);
    expect(play8.map(x => `${x.suit}${x.rank}`).sort()).toEqual(['club2','spade2','spade2']);
  });

  test('game_004 round9: should split triple by slots and use single 2', () => {
    const southRound9: Card[] = [
      c('diamond','2',201), c('heart','10',202), c('heart','10',203), c('heart','9',204), c('heart','9',205),
      c('heart','6',206), c('heart','6',207), c('heart','5',208), c('heart','5',209), c('club','A',210), c('diamond','A',211), c('diamond','J',212),
      c('joker' as any,'big' as any,213), c('joker' as any,'big' as any,214), c('joker' as any,'small' as any,215), c('joker' as any,'small' as any,216)
    ] as any;

    const lead9 = [c('heart','3',300), c('heart','3',301), c('heart','3',302)];
    const current9 = [
      { seat: 'north' as Seat, cards: lead9 },
      { seat: 'west' as Seat, cards: [c('club','2',303), c('club','2',304), c('diamond','2',305)] }
    ];

    const play9 = followCardsStrategy(southRound9, lead9, current9, 'south', ctx);
    expect(play9.length).toBe(3);

    const ranks = play9.map(x => x.rank);
    const rankCounts = new Map<string, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
    const hasPair = Array.from(rankCounts.values()).some(v => v >= 2);
    expect(hasPair).toBe(true);
  });
});
