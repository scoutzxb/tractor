// 核心类型定义

export type Suit = 'spade' | 'heart' | 'club' | 'diamond';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | 'AA';
export type JokerType = 'big' | 'small';
export type Seat = 'east' | 'north' | 'west' | 'south';

export interface Card {
  id: number;          // 0-161 唯一标识
  suit?: Suit;         // 王牌无花色
  rank?: Rank;         // 王牌无点数
  joker?: JokerType;
}

export interface GameContext {
  level: Rank;              // 当前打几
  trumpSuit: Suit | null;   // 主花色（null=无主）
}

export interface TeamLevels {
  eastWest: Rank;  // 东西队当前级别
  northSouth: Rank; // 南北队当前级别
}

export type CombType = 'super_tractor' | 'triple' | 'tractor' | 'pair' | 'single';

export interface Component {
  type: CombType;
  cards: Card[];
  length?: number;    // 拖拉机/超级拖拉机的连数
}

export type ParseResult = Component[];

export interface ParsedPlay {
  components: Component[];
  suit?: Suit;        // 主牌甩牌时为 undefined
  isTrump: boolean;   // 是否全是主牌
}
