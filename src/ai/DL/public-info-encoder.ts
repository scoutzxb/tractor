/**
 * 公共信息编码器
 * 
 * 编码所有玩家都能推断出的确定性信息：
 * 1. 已出的牌（全局历史）
 * 2. 剩余牌分布（每家还剩多少张）
 * 3. 分数状态（攻方已得分）
 * 4. 推断事实（void、结构推断等）
 */

import type { Card, GameContext, Seat, Suit, Rank } from '../../core/types';
import { classifyCard, getCardKey } from '../../core/deck';

// ===== 核心数据结构 =====

/** 公共信息快照 */
export interface PublicInfo {
  /** 游戏上下文 */
  ctx: GameContext;
  
  /** 庄家座位 */
  dealer: Seat;
  
  /** 当前轮次 */
  roundNumber: number;
  
  /** 当前首家 */
  currentLeader: Seat;
  
  /** 已出的所有牌 */
  playedCards: Card[];
  
  /** 每家剩余手牌数 */
  remainingCounts: Map<Seat, number>;
  
  /** 攻方总得分 */
  attackScore: number;
  
  /** 上一轮胜者 */
  lastWinner: Seat | null;
  
  /** 推断出的事实 */
  facts: InferredFacts;
  
  /** 历史事件（简化版） */
  history: HistoryEvent[];
}

/** 推断出的事实 */
export interface InferredFacts {
  /** 某家在某门已void */
  voids: Map<Seat, Set<Suit | 'trump'>>;
  
  /** 某家在某门已无对子（根据出牌推断） */
  noPairs: Map<Seat, Set<Suit | 'trump'>>;
  
  /** 某家在某门已无三张 */
  noTriples: Map<Seat, Set<Suit | 'trump'>>;
  
  /** 某家在某门的最大牌（已打出的最大牌） */
  maxPlayedBySuit: Map<Seat, Map<Suit | 'trump', Rank | 'joker'>>;
  
  /** 某门已出完的牌 */
  exhaustedRanks: Map<Suit | 'trump', Set<Rank | 'joker'>>;
  
  /** 分数牌已出数量 */
  scoreCardsPlayed: { fives: number; tens: number; kings: number };
}

/** 历史事件（简化版，用于编码） */
export interface HistoryEvent {
  type: 'lead' | 'follow' | 'kill' | 'trick_end' | 'throw_fail';
  seat: Seat;
  /** 出的牌（可选） */
  cards?: Card[];
  /** 得分（仅trick_end） */
  score?: number;
  /** 胜者（仅trick_end） */
  winner?: Seat;
  /** 甩牌失败原因（仅throw_fail） */
  failReason?: string;
}

// ===== 编码器 =====

/** 公共信息编码器 */
export class PublicInfoEncoder {
  private state: PublicInfo;
  
  constructor(ctx: GameContext, dealer: Seat) {
    this.state = this.createInitialState(ctx, dealer);
  }
  
  private createInitialState(ctx: GameContext, dealer: Seat): PublicInfo {
    return {
      ctx,
      dealer,
      roundNumber: 0,
      currentLeader: dealer,
      playedCards: [],
      remainingCounts: new Map([
        ['east', 39],
        ['north', 39],
        ['west', 39],
        ['south', 39]
      ]),
      attackScore: 0,
      lastWinner: null,
      facts: this.createEmptyFacts(),
      history: []
    };
  }
  
  private createEmptyFacts(): InferredFacts {
    return {
      voids: new Map([
        ['east', new Set()],
        ['north', new Set()],
        ['west', new Set()],
        ['south', new Set()]
      ]),
      noPairs: new Map([
        ['east', new Set()],
        ['north', new Set()],
        ['west', new Set()],
        ['south', new Set()]
      ]),
      noTriples: new Map([
        ['east', new Set()],
        ['north', new Set()],
        ['west', new Set()],
        ['south', new Set()]
      ]),
      maxPlayedBySuit: new Map([
        ['east', new Map()],
        ['north', new Map()],
        ['west', new Map()],
        ['south', new Map()]
      ]),
      exhaustedRanks: new Map(),
      scoreCardsPlayed: { fives: 0, tens: 0, kings: 0 }
    };
  }
  
  // ===== 事件处理 =====
  
  /** 处理出牌事件 */
  processPlay(seat: Seat, cards: Card[], isKill: boolean = false): void {
    // 记录历史
    const eventType = isKill ? 'kill' : (this.state.history.length === 0 || 
      this.state.history[this.state.history.length - 1].type === 'trick_end') ? 'lead' : 'follow';
    
    this.state.history.push({
      type: eventType,
      seat,
      cards
    });
    
    // 更新已出牌
    this.state.playedCards.push(...cards);
    
    // 更新剩余牌数
    const current = this.state.remainingCounts.get(seat) || 0;
    this.state.remainingCounts.set(seat, current - cards.length);
    
    // 更新推断事实
    this.updateFacts(seat, cards, isKill);
  }
  
  /** 处理甩牌失败事件 */
  processThrowFail(seat: Seat, attemptedCards: Card[], actualCards: Card[], reason: string): void {
    this.state.history.push({
      type: 'throw_fail',
      seat,
      cards: actualCards,
      failReason: reason
    });
    
    this.state.playedCards.push(...actualCards);
    
    const current = this.state.remainingCounts.get(seat) || 0;
    this.state.remainingCounts.set(seat, current - actualCards.length);
    
    this.updateFacts(seat, actualCards, false);
  }
  
  /** 处理一轮结束 */
  processTrickEnd(winner: Seat, score: number): void {
    this.state.history.push({
      type: 'trick_end',
      seat: winner,
      score,
      winner
    });
    
    // 更新分数
    this.state.attackScore += score;
    this.state.lastWinner = winner;
    this.state.currentLeader = winner;
    this.state.roundNumber++;
    
    // 更新void推断（基于跟牌情况）
    this.inferVoidsFromTrick();
  }
  
  // ===== 推断逻辑 =====
  
  private updateFacts(seat: Seat, cards: Card[], isKill: boolean): void {
    const ctx = this.state.ctx;
    
    for (const card of cards) {
      // 更新分数牌计数
      if (card.rank === '5') this.state.facts.scoreCardsPlayed.fives++;
      else if (card.rank === '10') this.state.facts.scoreCardsPlayed.tens++;
      else if (card.rank === 'K') this.state.facts.scoreCardsPlayed.kings++;
      
      // 更新exhaustedRanks
      const cls = classifyCard(card, ctx);
      const suitKey: Suit | 'trump' = cls === 'trump' ? 'trump' : (cls as { suit: Suit }).suit;
      
      if (!this.state.facts.exhaustedRanks.has(suitKey)) {
        this.state.facts.exhaustedRanks.set(suitKey, new Set());
      }
      
      if (card.joker) {
        this.state.facts.exhaustedRanks.get(suitKey)!.add('joker');
      } else if (card.rank) {
        this.state.facts.exhaustedRanks.get(suitKey)!.add(card.rank);
      }
    }
    
    // 根据出牌结构推断
    this.inferStructureFacts(seat, cards);
  }
  
  private inferStructureFacts(seat: Seat, cards: Card[]): void {
    const ctx = this.state.ctx;
    const keyCount = new Map<string, number>();
    
    for (const c of cards) {
      const k = getCardKey(c);
      keyCount.set(k, (keyCount.get(k) || 0) + 1);
    }
    
    // 分析出牌中的牌型
    const suits = new Map<Suit | 'trump', Card[]>();
    for (const c of cards) {
      const cls = classifyCard(c, ctx);
      const suit: Suit | 'trump' = cls === 'trump' ? 'trump' : (cls as { suit: Suit }).suit;
      if (!suits.has(suit)) suits.set(suit, []);
      suits.get(suit)!.push(c);
    }
    
    for (const [suit, suitCards] of suits) {
      const suitKeyCount = new Map<string, number>();
      for (const c of suitCards) {
        const k = getCardKey(c);
        suitKeyCount.set(k, (suitKeyCount.get(k) || 0) + 1);
      }
      
      // 如果出了单张，不能推断noPairs/noTriples
      // 如果出了对子但没有出三张，可以推断没有三张
      // 如果出了对子，可以标记
    }
  }
  
  private inferVoidsFromTrick(): void {
    // 检查最后一轮的历史，推断void
    // 如果某家跟牌时没有出同门牌而是出了主牌杀牌，推断void
    // 或者出了其他花色贴牌，推断void
    
    const lastTrickEvents = this.getLastTrickEvents();
    if (lastTrickEvents.length < 2) return;
    
    const leadEvent = lastTrickEvents[0];
    if (!leadEvent.cards || leadEvent.cards.length === 0) return;
    
    const leadSuit = this.getCardsSuit(leadEvent.cards);
    
    for (let i = 1; i < lastTrickEvents.length; i++) {
      const event = lastTrickEvents[i];
      if (!event.cards) continue;
      
      // 如果不是lead事件，检查是否跟了同门
      if (event.type === 'follow' || event.type === 'kill') {
        const playSuit = this.getCardsSuit(event.cards);
        
        // 如果没有跟同门，推断void
        if (playSuit !== leadSuit && playSuit !== 'trump') {
          // 贴牌，推断void
          const voids = this.state.facts.voids.get(event.seat);
          if (voids) voids.add(leadSuit);
        } else if (playSuit === 'trump' && leadSuit !== 'trump') {
          // 杀牌，推断void
          const voids = this.state.facts.voids.get(event.seat);
          if (voids) voids.add(leadSuit);
        }
      }
    }
  }
  
  private getLastTrickEvents(): HistoryEvent[] {
    const result: HistoryEvent[] = [];
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const event = this.state.history[i];
      result.unshift(event);
      if (event.type === 'trick_end' && i < this.state.history.length - 1) {
        break;
      }
    }
    return result;
  }
  
  private getCardsSuit(cards: Card[]): Suit | 'trump' {
    const ctx = this.state.ctx;
    if (cards.length === 0) return 'trump';
    
    const cls = classifyCard(cards[0], ctx);
    if (cls === 'trump') return 'trump';
    return (cls as { suit: Suit }).suit;
  }
  
  // ===== 编码输出 =====
  
  /** 获取当前状态 */
  getState(): PublicInfo {
    return this.state;
  }
  
  /** 编码为张量格式（用于神经网络） */
  encode(): PublicInfoTensor {
    return {
      // 基础信息
      roundNumber: this.state.roundNumber,
      attackScore: this.state.attackScore,
      
      // 已出牌矩阵 (4花色 × 15点数)
      playedCardsMatrix: this.encodePlayedCards(),
      
      // 剩余牌数 (4家)
      remainingCounts: this.encodeRemainingCounts(),
      
      // Void信息 (4家 × 4花色/主牌)
      voidMatrix: this.encodeVoids(),
      
      // 分数牌已出 (3种)
      scoreCardsPlayed: [
        this.state.facts.scoreCardsPlayed.fives,
        this.state.facts.scoreCardsPlayed.tens,
        this.state.facts.scoreCardsPlayed.kings
      ],
      
      // 历史事件（最近N个）
      recentHistory: this.encodeRecentHistory(20)
    };
  }
  
  private encodePlayedCards(): number[][] {
    // 4行（主牌 + 3副牌） × 15列（A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2, 小王, 大王）
    const matrix: number[][] = [[], [], [], []];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 15; j++) {
        matrix[i].push(0);
      }
    }
    
    const ctx = this.state.ctx;
    const suitOrder = this.getSuitOrder();
    
    for (const card of this.state.playedCards) {
      const cls = classifyCard(card, ctx);
      let suitIdx: number;
      
      if (cls === 'trump') {
        suitIdx = 0; // 主牌
      } else {
        const suit = (cls as { suit: Suit }).suit;
        suitIdx = suitOrder.indexOf(suit);
        if (suitIdx === -1) suitIdx = 0;
        suitIdx = (suitIdx + 1) % 4; // 偏移，主牌在0
      }
      
      const rankIdx = this.getRankIndex(card);
      if (rankIdx >= 0 && rankIdx < 15) {
        matrix[suitIdx][rankIdx]++;
      }
    }
    
    return matrix;
  }
  
  private encodeRemainingCounts(): number[] {
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    return seats.map(s => (this.state.remainingCounts.get(s) || 0) / 39);
  }
  
  private encodeVoids(): number[][] {
    // 4家 × 4门（主牌、副牌1、副牌2、副牌3）
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    const matrix: number[][] = [];
    
    for (const seat of seats) {
      const voids = this.state.facts.voids.get(seat) || new Set();
      const row: number[] = [0, 0, 0, 0];
      
      if (voids.has('trump')) row[0] = 1;
      
      const suitOrder = this.getSuitOrder();
      for (const suit of voids) {
        if (suit === 'trump') continue;
        const idx = suitOrder.indexOf(suit);
        if (idx >= 0) row[idx + 1] = 1;
      }
      
      matrix.push(row);
    }
    
    return matrix;
  }
  
  private encodeRecentHistory(maxEvents: number): number[][] {
    const events = this.state.history.slice(-maxEvents);
    const result: number[][] = [];
    
    for (const event of events) {
      const vec = new Array(10).fill(0);
      
      // 事件类型编码
      vec[0] = event.type === 'lead' ? 1 : 0;
      vec[1] = event.type === 'follow' ? 1 : 0;
      vec[2] = event.type === 'kill' ? 1 : 0;
      vec[3] = event.type === 'trick_end' ? 1 : 0;
      vec[4] = event.type === 'throw_fail' ? 1 : 0;
      
      // 座位编码
      vec[5] = event.seat === 'east' ? 1 : 0;
      vec[6] = event.seat === 'north' ? 1 : 0;
      vec[7] = event.seat === 'west' ? 1 : 0;
      vec[8] = event.seat === 'south' ? 1 : 0;
      
      // 分数（如果有）
      vec[9] = (event.score || 0) / 100;
      
      result.push(vec);
    }
    
    // Padding
    while (result.length < maxEvents) {
      result.push(new Array(10).fill(0));
    }
    
    return result;
  }
  
  private getSuitOrder(): Suit[] {
    const allSuits: Suit[] = ['spade', 'heart', 'club', 'diamond'];
    const trumpSuit = this.state.ctx.trumpSuit;
    
    if (!trumpSuit) {
      return allSuits;
    }
    
    // 主牌放第一个
    const result: Suit[] = [trumpSuit];
    for (const s of allSuits) {
      if (s !== trumpSuit) result.push(s);
    }
    return result;
  }
  
  private getRankIndex(card: Card): number {
    if (card.joker === 'big') return 14;
    if (card.joker === 'small') return 13;
    
    const rankOrder: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    const idx = rankOrder.indexOf(card.rank!);
    return idx;
  }
}

/** 公共信息张量格式 */
export interface PublicInfoTensor {
  /** 当前轮次 (0-38) */
  roundNumber: number;
  
  /** 攻方得分 (0-360) */
  attackScore: number;
  
  /** 已出牌矩阵: [4花色][15点数] - 值为出牌数量 */
  playedCardsMatrix: number[][];
  
  /** 剩余牌数: [4家] - 归一化到0-1 */
  remainingCounts: number[];
  
  /** Void矩阵: [4家][4门] - 0/1表示是否void */
  voidMatrix: number[][];
  
  /** 分数牌已出: [5, 10, K的数量] */
  scoreCardsPlayed: number[];
  
  /** 最近历史: [N事件][10维] */
  recentHistory: number[][];
}

// ===== 工具函数 =====

/** 判断某家是否void某门 */
export function isVoid(facts: InferredFacts, seat: Seat, suit: Suit | 'trump'): boolean {
  const voids = facts.voids.get(seat);
  return voids ? voids.has(suit) : false;
}

/** 判断某家是否某门无对子 */
export function hasNoPairs(facts: InferredFacts, seat: Seat, suit: Suit | 'trump'): boolean {
  const noPairs = facts.noPairs.get(seat);
  return noPairs ? noPairs.has(suit) : false;
}

/** 计算某门剩余牌数 */
export function countRemainingInSuit(
  playedCards: Card[],
  suit: Suit | 'trump',
  ctx: GameContext
): number {
  // 三副牌，每门每点数3张
  const totalInSuit = suit === 'trump' ? 18 + 6 : 39; // 主牌: 18张(13×1+大王+小王+级牌×2) + 级牌×3? 实际是15点数×3 + 2王
  
  let played = 0;
  for (const card of playedCards) {
    const cls = classifyCard(card, ctx);
    if (suit === 'trump' && cls === 'trump') played++;
    else if (suit !== 'trump' && cls !== 'trump') {
      const cardSuit = (cls as { suit: Suit }).suit;
      if (cardSuit === suit) played++;
    }
  }
  
  return totalInSuit - played;
}