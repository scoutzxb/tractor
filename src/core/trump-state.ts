// M7: 亮主状态机

import type { Card, Suit, Rank, Seat, GameContext } from './types';
import { isTrump, getCardKey } from './deck';

/**
 * 亮主牌型优先级
 */
export const TRUMP_PRIORITY = {
  THREE_BIG_JOKER: 1,      // 三个大王
  THREE_SMALL_JOKER: 2,    // 三个小王
  THREE_SAME_SUIT: 3,      // 三张同花色
  PAIR_BIG_JOKER: 4,       // 一对大王
  PAIR_SMALL_JOKER: 5,     // 一对小王
  PAIR_SAME_SUIT: 6,       // 一对同花色
  SINGLE_SUIT: 7           // 单张花色牌
};

/**
 * 花色优先级（炒底时使用）
 */
export const SUIT_PRIORITY = {
  'spade': 1,    // 黑桃最高
  'heart': 2,
  'club': 3,
  'diamond': 4
};

/**
 * 亮主信息
 */
export interface TrumpDeclaration {
  suit: Suit | null;        // 主花色（null=无主）
  priority: number;         // 优先级
  cards: Card[];           // 用于亮主的牌
  declarer: Seat;          // 亮主者
  level: Rank;             // 当前级别
}

/**
 * 亮主状态
 */
export interface TrumpState {
  phase: 'dealing' | 'declared' | 'kitty' | 'discarding' | 'ready';
  currentTrump: TrumpDeclaration | null;
  kittyHolder: Seat | null;   // 当前持有底牌的人
  declarations: TrumpDeclaration[]; // 所有亮主历史
  isGrabMode: boolean;        // 是否抢庄局
}

/**
 * 创建初始状态
 */
export function createTrumpState(isGrabMode: boolean = false): TrumpState {
  return {
    phase: 'dealing',
    currentTrump: null,
    kittyHolder: null,
    declarations: [],
    isGrabMode
  };
}

/**
 * 判断玩家是否可以亮主
 */
export function canDeclare(
  state: TrumpState,
  seat: Seat,
  cards: Card[],
  level: Rank,
  dealer?: Seat
): boolean {
  // 必须在发牌或亮主阶段
  if (state.phase !== 'dealing' && state.phase !== 'declared') {
    return false;
  }
  
  // 检查牌型是否有效
  const declaration = analyzeDeclaration(cards, level, seat);
  if (!declaration) {
    return false;
  }
  
  // 如果已有亮主
  if (state.currentTrump) {
    // 补亮机制：同一个玩家可以补亮同一花色的级牌
    if (state.currentTrump.declarer === seat && declaration.suit === state.currentTrump?.suit) {
      // 补亮时，牌数必须更多（从单张变一对，或一对变三张）
      if (declaration.cards.length <= state.currentTrump.cards.length) {
        return false;
      }
      // 补亮时优先级可以改变（单张→一对→三张，优先级提高）
      // 不需要检查优先级，只要牌数更多且同一花色即可
    } else {
      // 反主：必须更高优先级
      if (declaration.priority >= state.currentTrump.priority) {
        return false;
      }
      
      // 同级别不能反同一花色（仅对有花色的情况，无主用王反王不受此限）
      if (declaration.suit !== null && 
          declaration.suit === state.currentTrump?.suit) {
        return false;
      }
      
      // 不能反自己的主（除非是补亮）
      if (state.currentTrump.declarer === seat) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * 分析亮主牌型
 */
export function analyzeDeclaration(
  cards: Card[],
  level: Rank,
  seat: Seat
): TrumpDeclaration | null {
  if (cards.length === 0) return null;
  
  // 检查是否都是级牌或王
  const allValid = cards.every(card => {
    if (card.joker) return true;
    return card.rank === level;
  });
  
  if (!allValid) return null;
  
  // 统计
  const jokers = cards.filter(c => c.joker);
  const suitCards = cards.filter(c => !c.joker);
  
  // 三个大王
  if (jokers.length === 3 && jokers.every(j => j.joker === 'big')) {
    return {
      suit: null,
      priority: TRUMP_PRIORITY.THREE_BIG_JOKER,
      cards,
      declarer: seat,
      level
    };
  }
  
  // 三个小王
  if (jokers.length === 3 && jokers.every(j => j.joker === 'small')) {
    return {
      suit: null,
      priority: TRUMP_PRIORITY.THREE_SMALL_JOKER,
      cards,
      declarer: seat,
      level
    };
  }
  
  // 三张同花色
  if (suitCards.length === 3) {
    const suits = new Set(suitCards.map(c => c.suit));
    if (suits.size === 1) {
      return {
        suit: suitCards[0].suit!,
        priority: TRUMP_PRIORITY.THREE_SAME_SUIT,
        cards,
        declarer: seat,
        level
      };
    }
  }
  
  // 一对大王
  if (jokers.length === 2 && jokers.every(j => j.joker === 'big')) {
    return {
      suit: null,
      priority: TRUMP_PRIORITY.PAIR_BIG_JOKER,
      cards,
      declarer: seat,
      level
    };
  }
  
  // 一对小王
  if (jokers.length === 2 && jokers.every(j => j.joker === 'small')) {
    return {
      suit: null,
      priority: TRUMP_PRIORITY.PAIR_SMALL_JOKER,
      cards,
      declarer: seat,
      level
    };
  }
  
  // 一对同花色
  if (suitCards.length === 2) {
    const suits = new Set(suitCards.map(c => c.suit));
    if (suits.size === 1) {
      return {
        suit: suitCards[0].suit!,
        priority: TRUMP_PRIORITY.PAIR_SAME_SUIT,
        cards,
        declarer: seat,
        level
      };
    }
  }
  
  // 单张花色牌
  if (suitCards.length === 1 && jokers.length === 0) {
    return {
      suit: suitCards[0].suit!,
      priority: TRUMP_PRIORITY.SINGLE_SUIT,
      cards,
      declarer: seat,
      level
    };
  }
  
  return null;
}

/**
 * 执行亮主
 */
export function declare(
  state: TrumpState,
  seat: Seat,
  cards: Card[],
  level: Rank,
  dealer: Seat
): TrumpState {
  const declaration = analyzeDeclaration(cards, level, seat);
  if (!declaration) {
    throw new Error('Invalid declaration');
  }
  
  const newDeclarations = [...state.declarations, declaration];
  
  // 判断底牌归属
  let kittyHolder: Seat;
  if (state.isGrabMode) {
    // 抢庄局：亮主者=庄家
    kittyHolder = seat;
  } else {
    // 常规局：庄家持有底牌
    kittyHolder = dealer;
  }
  
  return {
    ...state,
    phase: 'declared',
    currentTrump: declaration,
    kittyHolder,
    declarations: newDeclarations
  };
}

/**
 * 判断玩家是否可以炒底
 */
export function canChaoDi(
  state: TrumpState,
  seat: Seat,
  cards: Card[],
  level: Rank
): boolean {
  // 抢庄局禁止炒底
  if (state.isGrabMode) {
    return false;
  }
  
  // 无人亮主局禁止炒底
  if (!state.currentTrump) {
    return false;
  }
  
  // 必须在亮主后、出牌前
  if (state.phase !== 'declared' && state.phase !== 'kitty') {
    return false;
  }
  
  // (a) 最后亮主/反主的人不能炒底
  if (state.currentTrump.declarer === seat) {
    return false;
  }
  
  // (b) 当前持有底牌的人不能炒底
  if (state.kittyHolder === seat) {
    return false;
  }
  
  // 检查是否有更高优先级的亮主
  const declaration = analyzeDeclaration(cards, level, seat);
  if (!declaration) {
    return false;
  }

  // 炒底不允许使用单张级牌
  if (declaration.priority === TRUMP_PRIORITY.SINGLE_SUIT) {
    return false;
  }
  
  // (c) 不能反成同一花色（仅当两者都有具体花色时才检查）
  if (declaration.suit !== null && state.currentTrump?.suit !== null 
      && declaration.suit === state.currentTrump?.suit) {
    return false;
  }
  
  // 花色优先级（黑桃>红桃>梅花>方块）
  const suitPriority: Record<Suit | null, number> = {
    spade: 4,
    heart: 3,
    club: 2,
    diamond: 1,
    null: 0  // 无主
  };
  
  const currentPriority = state.currentTrump.priority;
  const newPriority = declaration.priority;
  const currentSuitPriority = suitPriority[state.currentTrump.suit] || 0;
  const newSuitPriority = suitPriority[declaration.suit] || 0;
  
  const canChao = 
    newPriority < currentPriority ||
    (newPriority === currentPriority && newSuitPriority > currentSuitPriority) ||
    (newPriority === currentPriority - 1 && newSuitPriority > currentSuitPriority);
  
  if (!canChao) {
    return false;
  }
  
  return true;
}

/**
 * 执行炒底
 */
export function chaoDi(
  state: TrumpState,
  seat: Seat,
  cards: Card[],
  level: Rank
): TrumpState {
  const declaration = analyzeDeclaration(cards, level, seat);
  if (!declaration) {
    throw new Error('Invalid chao di declaration');
  }
  
  const newDeclarations = [...state.declarations, declaration];
  
  return {
    ...state,
    phase: 'kitty',
    currentTrump: declaration,
    kittyHolder: seat,  // 炒底者获得底牌
    declarations: newDeclarations
  };
}

/**
 * 无人亮主时翻底牌
 */
export function flipKitty(
  state: TrumpState,
  kitty: Card[],
  level: Rank,
  dealer: Seat
): TrumpState {
  if (state.currentTrump) {
    throw new Error('Already has trump declaration');
  }
  
  // 按优先级检查底牌
  let bestDeclaration: TrumpDeclaration | null = null;
  
  // 统计底牌
  const counts = new Map<string, Card[]>();
  for (const card of kitty) {
    const key = getCardKey(card);
    if (!counts.has(key)) {
      counts.set(key, []);
    }
    counts.get(key)!.push(card);
  }
  
  // 检查各种牌型（从高到低）
  
  // 三个大王
  const bigJokers = counts.get('JOKER_BIG');
  if (bigJokers && bigJokers.length >= 3) {
    bestDeclaration = {
      suit: null,
      priority: TRUMP_PRIORITY.THREE_BIG_JOKER,
      cards: bigJokers.slice(0, 3),
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }
  
  // 三个小王
  const smallJokers = counts.get('JOKER_SMALL');
  if (smallJokers && smallJokers.length >= 3) {
    bestDeclaration = {
      suit: null,
      priority: TRUMP_PRIORITY.THREE_SMALL_JOKER,
      cards: smallJokers.slice(0, 3),
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }
  
  // 检查级牌
  const levelCards = new Map<Suit, Card[]>();
  for (const [key, cardList] of counts) {
    if (key.startsWith('spade_') || key.startsWith('heart_') || 
        key.startsWith('club_') || key.startsWith('diamond_')) {
      const suit = cardList[0].suit!;
      if (cardList[0].rank === level) {
        if (!levelCards.has(suit)) {
          levelCards.set(suit, []);
        }
        levelCards.get(suit)!.push(...cardList);
      }
    }
  }
  
  // 三张同花色级牌
  for (const [suit, cards] of levelCards) {
    if (cards.length >= 3) {
      bestDeclaration = {
        suit,
        priority: TRUMP_PRIORITY.THREE_SAME_SUIT,
        cards: cards.slice(0, 3),
        declarer: dealer,
        level
      };
      return finalizeFlip(state, bestDeclaration, dealer);
    }
  }
  
  // 一对大王
  if (bigJokers && bigJokers.length >= 2) {
    bestDeclaration = {
      suit: null,
      priority: TRUMP_PRIORITY.PAIR_BIG_JOKER,
      cards: bigJokers.slice(0, 2),
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }
  
  // 一对小王
  if (smallJokers && smallJokers.length >= 2) {
    bestDeclaration = {
      suit: null,
      priority: TRUMP_PRIORITY.PAIR_SMALL_JOKER,
      cards: smallJokers.slice(0, 2),
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }
  
  // 一对同花色级牌
  for (const [suit, cards] of levelCards) {
    if (cards.length >= 2) {
      bestDeclaration = {
        suit,
        priority: TRUMP_PRIORITY.PAIR_SAME_SUIT,
        cards: cards.slice(0, 2),
        declarer: dealer,
        level
      };
      return finalizeFlip(state, bestDeclaration, dealer);
    }
  }
  
  // 单张级牌（取第一张）
  for (const [suit, cards] of levelCards) {
    if (cards.length >= 1) {
      bestDeclaration = {
        suit,
        priority: TRUMP_PRIORITY.SINGLE_SUIT,
        cards: [cards[0]],
        declarer: dealer,
        level
      };
      return finalizeFlip(state, bestDeclaration, dealer);
    }
  }
  
  // 单张大王：设置为无主
  if (bigJokers && bigJokers.length >= 1) {
    bestDeclaration = {
      suit: null,  // 无主
      priority: TRUMP_PRIORITY.SINGLE_SUIT,
      cards: [bigJokers[0]],
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }
  
  // 单张小王：设置为无主
  if (smallJokers && smallJokers.length >= 1) {
    bestDeclaration = {
      suit: null,  // 无主
      priority: TRUMP_PRIORITY.SINGLE_SUIT,
      cards: [smallJokers[0]],
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }  // 单张级牌（使用底牌中的第一张级牌）
  // 找出底牌中的第一张级牌
  let firstLevelCard: Card | null = null;
  for (const card of kitty) {
    if (card.rank === level && !card.joker) {
      firstLevelCard = card;
      break;
    }
  }
  
  if (firstLevelCard) {
    bestDeclaration = {
      suit: firstLevelCard.suit!,
      priority: TRUMP_PRIORITY.SINGLE_SUIT,
      cards: [firstLevelCard],
      declarer: dealer,
      level
    };
    return finalizeFlip(state, bestDeclaration, dealer);
  }
  

  
  // 如果底牌中没有任何级牌和王，使用第一张牌的花色
  const firstCard = kitty[0];
  let defaultSuit: Suit;
  
  if (firstCard.joker) {
    // 第一张是王，无主
    defaultSuit = null;
  } else {
    // 使用第一张牌的花色
    defaultSuit = firstCard.suit!;
  }
  
  bestDeclaration = {
    suit: defaultSuit,
    priority: TRUMP_PRIORITY.SINGLE_SUIT,
    cards: [firstCard],
    declarer: dealer,
    level
  };
  
  return finalizeFlip(state, bestDeclaration, dealer);
}

/**
 * 完成翻底牌
 */
function finalizeFlip(
  state: TrumpState,
  declaration: TrumpDeclaration,
  dealer: Seat
): TrumpState {
  return {
    ...state,
    phase: 'declared',
    currentTrump: declaration,
    kittyHolder: dealer,
    declarations: [...state.declarations, declaration]
  };
}

/**
 * 确认扣底完成
 */
export function confirmDiscard(state: TrumpState): TrumpState {
  if (state.phase !== 'kitty' && state.phase !== 'declared') {
    throw new Error('Invalid phase for discard');
  }
  
  return {
    ...state,
    phase: 'ready'
  };
}

/**
 * 获取当前主花色
 */
export function getCurrentTrumpSuit(state: TrumpState): Suit | null {
  return (state && state.currentTrump) ? state.currentTrump.suit : null;
}

/**
 * 创建游戏上下文
 */
export function createGameContext(level: Rank, state: TrumpState): GameContext {
  return {
    level,
    trumpSuit: getCurrentTrumpSuit(state)
  };
}
