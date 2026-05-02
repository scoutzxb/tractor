// 回归测试: 第4局第9轮 - 东家有级牌拖拉机时必须跟拖拉机
// 问题: 北家首出主牌三连拖拉机 552233，东家手上有 ♦4♦4 + ♠4♠4 组成的主牌拖拉机，自动补牌却出了 6688♦4♦4，拆掉了拖拉机。
// 修复后: 非法跟牌会被识别，autoCompleteFollow 会优先保留并跟出 ♦4♦4 + ♠4♠4，再补足第三对。

import { describe, expect, test } from 'bun:test';
import { autoCompleteFollow, validateFollowPlay } from '../src/core/follow-validator';
import { enumerateCards } from '../src/core/parser-enumerate';
import { getCardDisplayName } from '../src/core/deck';
import type { Card, GameContext } from '../src/core/types';

const card = (suit: string, rank: string, id: number): Card => ({ id, suit: suit as any, rank } as Card);
const joker = (type: 'big' | 'small', id: number): Card => ({ id, joker: type } as Card);
const names = (cards: Card[]) => cards.map(getCardDisplayName).sort();

describe('第4局第9轮 - 东家必须跟级牌拖拉机', () => {
  const ctx: GameContext = { level: '4', trumpSuit: 'spade' };

  const leadCards = [
    card('spade', '5', 100), card('spade', '5', 101),
    card('spade', '3', 102), card('spade', '3', 103),
    card('spade', '2', 104), card('spade', '2', 105)
  ];

  const eastHand = [
    joker('big', 1), joker('small', 2),
    card('spade', '4', 3), card('spade', '4', 4),
    card('club', '4', 5),
    card('diamond', '4', 6), card('diamond', '4', 7),
    card('spade', 'A', 8), card('spade', 'J', 9), card('spade', '10', 10), card('spade', '9', 11),
    card('spade', '8', 12), card('spade', '8', 13),
    card('spade', '7', 14),
    card('spade', '6', 15), card('spade', '6', 16), card('spade', '6', 17),
    card('spade', '2', 18)
  ];

  test('原日志中的 6688♦4♦4 跟牌应判非法，因为拆掉了 ♦4♦4+♠4♠4 拖拉机', () => {
    const loggedIllegalPlay = [
      card('spade', '6', 15), card('spade', '6', 16),
      card('spade', '8', 12), card('spade', '8', 13),
      card('diamond', '4', 6), card('diamond', '4', 7)
    ];

    const result = validateFollowPlay(loggedIllegalPlay, leadCards, eastHand, ctx);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('拖拉机');
  });

  test('自动补牌必须跟出 ♦4♦4+♠4♠4 拖拉机，并补足第三对', () => {
    const completed = autoCompleteFollow([], leadCards, eastHand, ctx);

    expect(completed.length).toBe(6);
    expect(validateFollowPlay(completed, leadCards, eastHand, ctx).valid).toBe(true);

    const tractorNames = enumerateCards(completed, ctx).tractors
      .map(chain => names(chain.flatMap(component => component.cards)));

    expect(tractorNames).toContainEqual(['♠4', '♠4', '♦4', '♦4']);
  });
});

console.log('✓ 第4局第9轮东家级牌拖拉机跟牌回归测试完成');
