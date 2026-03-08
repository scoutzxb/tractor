// M8: 游戏主循环 - 串联M1-M7实现完整游戏流程

import type { Card, GameContext, Seat, Rank, Suit } from '../core/types';
import { createDeck, shuffle, deal, sortHand, cardCompare, isTrump, SUIT_NAMES } from '../core/deck';
import { parseCards } from '../core/parser';
import { validateLeadPlay } from '../core/lead-validator';
import { validateFollowPlay, autoCompleteFollow } from '../core/follow-validator';
import { validateKill, compareKills } from '../core/kill-validator';
import { getPointCards, getKittyMultiplier, calculateResult, applyUpgrade, checkVictory } from '../core/scoring';
import {
  createTrumpState,
  declare,
  canDeclare,
  canChaoDi,
  chaoDi,
  flipKitty,
  createGameContext,
  type TrumpState
} from '../core/trump-state';

// 游戏状态
export interface GameState {
  level: Rank;                    // 当前级别
  dealer: Seat;                   // 庄家
  hands: Map<Seat, Card[]>;       // 四家手牌
  kitty: Card[];                  // 底牌
  trumpState: TrumpState;         // 亮主状态
  ctx: GameContext | null;        // 游戏上下文（亮主后生成）
  scores: Map<Seat, number>;      // 各座位得分
  roundNumber: number;            // 当前轮次
  currentLeader: Seat;            // 当前轮首家
  lastTrick: Card[];              // 上一轮出的牌
  lastWinner: Seat | null;        // 上一轮胜者
  isOver: boolean;                // 游戏是否结束
  winner: 'dealer' | 'opponent' | null;  // 最终胜者
}

// 玩家接口（用于AI或人类玩家）
export interface Player {
  seat: Seat;
  name: string;
  
  // 亮主阶段（包括反主）
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null;
  
  // 炒底阶段
  chooseChaoDi(hand: Card[], level: Rank, state: TrumpState): Card[] | null;
  
  // 扣底阶段
  discardKitty(hand: Card[], kitty: Card[], ctx: GameContext): Card[];
  
  // 出牌阶段
  playCards(
    hand: Card[],
    leadCards: Card[] | null,
    ctx: GameContext,
    gameState: GameState
  ): Card[];
}

// 游戏事件日志
export interface GameLog {
  type: string;
  message: string;
  details?: any;
  timestamp: number;
  hands?: Map<Seat, Card[]>;
  ctx?: GameContext;
  kitty?: Card[];  // 添加底牌快照
}

export interface DeclarationRecord {
  seat: Seat;
  cards: Card[];
}

export interface DealRoundRecord {
  round: number;
  cardsBySeat: Map<Seat, Card>;
  declarationOrder: Seat[];
  declarations: DeclarationRecord[];
}

export interface DealingPhaseResult {
  deck: Card[];
  rounds: DealRoundRecord[];
}

export interface TrumpKittyPhaseResult {
  kittyAfterDeal: Card[];
  stateAfterFinalize: GameState;
  stateAfterDiscard: GameState;
  stateAfterChaoDi: GameState;
  chaoDiLogs: GameLog[];
}

// 回合引擎
export class GameEngine {
  private state: GameState;
  private players: Map<Seat, Player>;
  private logs: GameLog[] = [];
  private seed?: number;
  private currentDeck?: Card[];
  
  constructor(startLevel: Rank = '2', startDealer: Seat = 'east', isGrabMode: boolean = false, seed?: number) {
    this.state = this.createInitialState(startLevel, startDealer, isGrabMode);
    this.players = new Map();
    this.seed = seed;
  }
  
  // 创建初始状态
  private createInitialState(level: Rank, dealer: Seat, isGrabMode: boolean = false): GameState {
    return {
      level,
      dealer,
      hands: new Map([
        ['east', []],
        ['north', []],
        ['west', []],
        ['south', []]
      ]),
      kitty: [],
      trumpState: createTrumpState(isGrabMode),
      ctx: null,
      scores: new Map([
        ['east', 0],
        ['north', 0],
        ['west', 0],
        ['south', 0]
      ]),
      roundNumber: 0,
      currentLeader: dealer,  // 第一轮由庄家先出
      lastTrick: [],
      lastWinner: null,
      isOver: false,
      winner: null
    };
  }
  
  // 注册玩家
  registerPlayer(player: Player): void {
    this.players.set(player.seat, player);
  }
  
  // 获取玩家
  getPlayer(seat: Seat): Player | undefined {
    return this.players.get(seat);
  }
  
  // 获取下一个座位（逆时针）
  private getNextSeat(seat: Seat): Seat {
    const order: Seat[] = ['east', 'north', 'west', 'south'];
    const idx = order.indexOf(seat);
    return order[(idx + 1) % 4];
  }
  
  // 获取对家
  private getPartner(seat: Seat): Seat {
    const partners: Record<Seat, Seat> = {
      'east': 'west',
      'west': 'east',
      'north': 'south',
      'south': 'north'
    };
    return partners[seat];
  }
  
  // 判断是否是庄家方
  private isDealerTeam(seat: Seat): boolean {
    return seat === this.state.dealer || seat === this.getPartner(this.state.dealer);
  }
  
  // 记录日志
  private log(type: GameLog['type'], message: string, details?: any): void {
    const handsSnapshot = this.state.hands ? 
      new Map([
        ['east', [...this.state.hands.get('east') || []]],
        ['north', [...this.state.hands.get('north') || []]],
        ['west', [...this.state.hands.get('west') || []]],
        ['south', [...this.state.hands.get('south') || []]]
      ]) : undefined;

    this.logs.push({
      type,
      message,
      details,
      timestamp: new Date(),
      hands: handsSnapshot,
      ctx: this.state.ctx,  // 使用当前的ctx
      kitty: this.state.kitty ? [...this.state.kitty] : undefined
    });
  }
  
  // 阶段1：洗牌发牌
  dealCards(): void {
    const deck = shuffle(createDeck());
    const { hands, kitty } = deal(deck);
    
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    seats.forEach((seat, idx) => {
      this.state.hands.set(seat, hands[idx]);
    });
    
    this.state.kitty = kitty;
    
    this.log('deal', '发牌完成', {
      kittySize: kitty.length,
      handSizes: hands.map(h => h.length)
    });
  }
  
  // 新增：创建牌组并准备抓牌
  prepareDeck(): Card[] {
    const deck = shuffle(createDeck(), this.seed);
    this.currentDeck = deck;
    this.log('deal', '洗牌完成', { deckSize: deck.length, seed: this.seed });
    return deck;
  }
  
  // 新增：抓一轮牌（返回本轮每个玩家抓的牌）
  dealOneRound(deck: Card[], roundNumber: number): Map<Seat, Card> {
    const allSeats: Seat[] = ['east', 'north', 'west', 'south'];
    const dealerIdx = allSeats.indexOf(this.state.dealer);
    const roundCards = new Map<Seat, Card>();
    
    // 从庄家开始，按逆时针顺序发牌
    const startIdx = (roundNumber - 1) * 4;
    
    // 检查是否还有足够的牌
    if (startIdx >= deck.length) {
      return roundCards; // 牌已发完
    }
    
    for (let i = 0; i < 4; i++) {
      const cardIdx = startIdx + i;
      // 检查是否超出牌组范围
      if (cardIdx >= deck.length) {
        continue; // 跳过这个玩家，牌已发完
      }
      
      const card = deck[cardIdx];
      const seatIdx = (dealerIdx + i) % 4;
      const seat = allSeats[seatIdx];
      const hand = this.state.hands.get(seat) || [];
      hand.push(card);
      this.state.hands.set(seat, hand);
      roundCards.set(seat, card);
    }
    
    return roundCards;
  }
  
  // 新增：处理亮主（边抓牌边亮主）
  tryDeclare(seat: Seat, cards: Card[]): boolean {
    const canDec = canDeclare(this.state.trumpState, seat, cards, this.state.level, this.state.dealer);
    if (!canDec) {
      console.log(`  ${seat} 补亮失败: canDeclare返回false`);
      return false;
    }
    
    try {
      this.state.trumpState = declare(
        this.state.trumpState,
        seat,
        cards,
        this.state.level,
        this.state.dealer
      );
      
      this.log('trump', `${seat} 亮主成功`, {
        cards: cards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
        trump: this.state.trumpState.currentTrump
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  // 新增：设置底牌（在抓牌完成后）
  setKitty(deck: Card[]): void {
    this.state.kitty = deck.slice(156);
    this.log('deal', '底牌设置完成', {
      kittySize: this.state.kitty.length
    });
  }
  
  // 新增：完成亮主阶段（生成GameContext）
  finalizeTrumpPhase(): void {
    // 如果无人亮主，翻底牌
    if (!this.state.trumpState.currentTrump) {
      this.state.trumpState = flipKitty(this.state.trumpState, this.state.kitty);
      this.log('trump', '无人亮主，翻底牌', {
        trump: this.state.trumpState.currentTrump
      });
    }
    
    // 抢庄局：最后亮主成功者成为庄家
    if (this.state.trumpState.isGrabMode && this.state.trumpState.currentTrump) {
      this.state.dealer = this.state.trumpState.currentTrump.declarer;
      this.log('trump', '抢庄局：亮主者成为庄家', {
        dealer: this.state.dealer
      });
    }
    
    // 生成GameContext
    this.state.ctx = createGameContext(this.state.level, this.state.trumpState);
  }
  
  // 阶段2：亮主
  trumpPhase(): void {
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    let hasDeclaration = false;
    
    // 按座位顺序询问亮主
    for (const seat of seats) {
      const player = this.players.get(seat);
      if (!player) continue;
      
      const hand = this.state.hands.get(seat) || [];
      const cards = player.chooseTrump(hand, this.state.level, this.state.trumpState);
      
      if (cards && cards.length > 0 && canDeclare(this.state.trumpState, seat, cards, this.state.level, this.state.dealer)) {
        try {
          this.state.trumpState = declare(
            this.state.trumpState,
            seat,
            cards,
            this.state.level,
            this.state.dealer
          );
          hasDeclaration = true;
          
          this.log('trump', `${seat} 亮主成功`, {
            cards: cards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
            trump: this.state.trumpState.currentTrump
          });
          
          break; // 有人亮主，结束
        } catch (error) {
          // 亮主失败，继续询问下一个
        }
      }
    }
    
    // 无人亮主，翻底牌
    if (!hasDeclaration) {
      this.state.trumpState = flipKitty(this.state.trumpState, this.state.kitty);
      
      this.log('trump', '无人亮主，翻底牌', {
        trump: this.state.trumpState.currentTrump
      });
    }
    
    // 生成GameContext
    this.state.ctx = createGameContext(this.state.level, this.state.trumpState);
  }
  
  // 阶段2.5：炒底
  chaoDiPhase(): void {
    // 抢庄局禁止炒底
    if (this.state.trumpState.isGrabMode) return;
    
    // 无人亮主局禁止炒底
    if (!this.state.trumpState.currentTrump) return;
    
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    const maxRounds = 3;
    let currentStartIdx = seats.indexOf(this.state.dealer);
    
    for (let round = 0; round < maxRounds; round++) {
      let chaoDiHappened = false;
      
      // 从currentStartIdx开始，逆时针遍历所有玩家
      for (let i = 0; i < seats.length; i++) {
        const seatIdx = (currentStartIdx + i) % seats.length;
        const seat = seats[seatIdx];
        
        // 最后亮主/反主的人不能炒底
        if (seat === this.state.trumpState.currentTrump?.declarer) continue;
        
        const player = this.players.get(seat);
        if (!player) continue;
        
        const hand = this.state.hands.get(seat) || [];
        const cards = player.chooseChaoDi(hand, this.state.level, this.state.trumpState);
        
        if (cards && cards.length > 0 && canChaoDi(this.state.trumpState, seat, cards, this.state.level)) {
          // 炒底成功
          this.state.trumpState = chaoDi(this.state.trumpState, seat, cards, this.state.level);
          chaoDiHappened = true;
          
          // 更新GameContext（必须在discardKitty之前）
          this.state.ctx = createGameContext(this.state.level, this.state.trumpState);
          
          // 炒底者获得底牌
          const receivedKitty = [...this.state.kitty];
          const chaoDiHand = [...(this.state.hands.get(seat) || []), ...this.state.kitty];
          
          // 扣回6张牌
          const toReturn = player.discardKitty(chaoDiHand, this.state.kitty, this.state.ctx!);
          
          // 计算哪些牌被放回底牌（扣底牌）
          let discardedCards: Card[];
          
          // 验证扣牌数量
          if (toReturn.length !== 39) {
            // 如果数量不对，保留前39张
            this.state.hands.set(seat, chaoDiHand.slice(0, 39));
            this.state.kitty = chaoDiHand.slice(39);
            discardedCards = chaoDiHand.slice(39);
          } else {
            this.state.hands.set(seat, toReturn);
            discardedCards = chaoDiHand.filter(c => !toReturn.includes(c));
            this.state.kitty = discardedCards;
          }
          
          // 更新下一轮起始位置
          currentStartIdx = seatIdx;
          
          // 更新GameContext
          this.state.ctx = createGameContext(this.state.level, this.state.trumpState);
          
          this.log('chaoDi', `${seat} 炒底成功: ${cards.length === 1 ? '单张' : cards.length === 2 ? '一对' : cards.length === 3 ? '三张' : `${cards.length}张`}${cards.every(c => c.joker === 'big') ? '大王' : cards.every(c => c.joker === 'small') ? '小王' : cards[0].suit ? SUIT_NAMES[cards[0].suit] : '无主'}`, {
            cards: cards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
            newTrump: this.state.trumpState.currentTrump,
            receivedKitty: receivedKitty.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
            discardedKitty: discardedCards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
            kittySize: this.state.kitty.length,
          });
          
          break;
        }
      }
      
      if (!chaoDiHappened) break;
    }
  }
  
  /**
   * 单步炒底 - 供外部轮询调用
   * 尝试让指定座位炒底，如果成功则更新状态并返回 true
   */
  tryChaoDi(seat: Seat, cards: Card[]): boolean {
    // 检查是否可以炒底
    if (!canChaoDi(this.state.trumpState, seat, cards, this.state.level)) {
      return false;
    }
    
    // 执行炒底
    this.state.trumpState = chaoDi(this.state.trumpState, seat, cards, this.state.level);
    
    // 更新游戏上下文
    this.state.ctx = createGameContext(this.state.level, this.state.trumpState);
    
    // 给炒底者底牌
    const hand = this.state.hands.get(seat) || [];
    this.state.hands.set(seat, [...hand, ...this.state.kitty]);
    
    // 清空底牌（等待扣底）
    this.state.kitty = [];
    
    // 记录日志
    this.log('chaoDi', `${seat} 炒底成功`, {
      cards: cards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
      newTrump: this.state.trumpState.currentTrump,
    });
    
    return true;
  }
  
  // 阶段3：庄家拿底牌扣底
  discardPhase(): void {
    const dealer = this.players.get(this.state.dealer);
    if (!dealer) {
      // AI自动扣底：随机选6张
      const hand = this.state.hands.get(this.state.dealer) || [];
      const toDiscard = hand.slice(0, 6);
      this.state.kitty = toDiscard;
      this.state.hands.set(
        this.state.dealer,
        hand.filter(c => !toDiscard.includes(c))
      );
    } else {
      const hand = [...(this.state.hands.get(this.state.dealer) || []), ...this.state.kitty];
      const newHand = dealer.discardKitty(hand, this.state.kitty, this.state.ctx!);
      
      // 验证扣底：必须留39张
      if (newHand.length !== 39) {
        // 自动保留前39张
        this.state.hands.set(this.state.dealer, hand.slice(0, 39));
        this.state.kitty = hand.slice(39);
      } else {
        this.state.hands.set(this.state.dealer, newHand);
        this.state.kitty = hand.filter(c => !newHand.includes(c));
      }
    }
    
    this.log('discard', '庄家扣底完成', {
      kittySize: this.state.kitty.length
    });
  }
  
  // 阶段4：出牌循环
  playPhase(): void {
    // 39轮出牌
    for (let round = 0; round < 39; round++) {
      this.state.roundNumber = round + 1;
      
      const trick = this.playOneTrick();
      
      // 计算得分
      const score = getPointCards(trick.cards);
      if (score > 0) {
        const winnerScore = this.state.scores.get(trick.winner) || 0;
        this.state.scores.set(trick.winner, winnerScore + score);
        
        this.log('score', `${trick.winner} 得 ${score} 分`, {
          round: round + 1,
          cards: trick.cards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`)
        });
      }
      
      // 下一轮首家
      this.state.currentLeader = trick.winner;
      this.state.lastTrick = trick.cards;
      this.state.lastWinner = trick.winner;
      
      this.log('trick', `第 ${round + 1} 轮: ${trick.winner} 胜`, {
        leader: trick.leader
      });
    }
  }
  
  // 单轮出牌
  private playOneTrick(): { leader: Seat; cards: Card[]; winner: Seat } {
    const leader = this.state.currentLeader;
    const order = this.getPlayOrder(leader);
    
    // 首家出牌
    const leaderHand = this.state.hands.get(leader) || [];
    const leaderPlayer = this.players.get(leader);
    
    let leadCards: Card[];
    if (leaderPlayer) {
      leadCards = leaderPlayer.playCards(leaderHand, null, this.state.ctx!, this.state);
      // 防护：过滤掉undefined的card
      leadCards = leadCards.filter(c => c && c.id !== undefined);
    } else {
      // AI随机出牌：出第一张合法的牌
      leadCards = [leaderHand[0]];
    }
    
    // 如果leadCards为空，出第一张手牌
    if (leadCards.length === 0 && leaderHand.length > 0) {
      leadCards = [leaderHand[0]];
    }
    
    // 验证首家出牌
    const leadValidation = validateLeadPlay(
      leadCards,
      order.slice(1).map(s => this.state.hands.get(s) || []),
      this.state.ctx!
    );
    
    if (!leadValidation.valid) {
      // 如果甩牌失败，出最小组件
      leadCards = leadCards.slice(0, 1);
    }
    
    // 从手牌移除
    this.removeCardsFromHand(leader, leadCards);
    
    this.log('play', `${leader} 领出`, {
      cards: leadCards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
      remaining: this.state.hands.get(leader)!.length
    });
    
    // 其他三家跟牌
    const allPlays: { seat: Seat; cards: Card[]; isKill: boolean }[] = [
      { seat: leader, cards: leadCards, isKill: false }
    ];
    
    for (const seat of order.slice(1)) {
      const hand = this.state.hands.get(seat) || [];
      const player = this.players.get(seat);
      
      let playCards: Card[];
      if (player) {
        playCards = player.playCards(hand, leadCards, this.state.ctx!, this.state);
        // 防护：过滤掉undefined的card
        playCards = playCards.filter(c => c && c.id !== undefined);
      } else {
        // AI自动跟牌
        playCards = autoCompleteFollow([], leadCards, hand, this.state.ctx!);
      }
      
      // 如果playCards为空，自动补选
      if (playCards.length === 0) {
        playCards = autoCompleteFollow([], leadCards, hand, this.state.ctx!);
      }
      
      // 验证跟牌
      const followValidation = validateFollowPlay(playCards, leadCards, hand, this.state.ctx!);
      if (!followValidation.valid) {
        // 非法出牌，自动补选
        playCards = autoCompleteFollow([], leadCards, hand, this.state.ctx!);
      }
      
      // 判断是否杀牌
      const isKill = this.checkIfKill(playCards, leadCards);
      
      // 从手牌移除
      this.removeCardsFromHand(seat, playCards);
      
      allPlays.push({ seat, cards: playCards, isKill });
      
      this.log('play', `${seat} 跟牌`, {
        cards: playCards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
        isKill,
        remaining: this.state.hands.get(seat)!.length
      });
    }
    
    // 判定胜者
    const winner = this.determineTrickWinner(allPlays, leadCards);
    
    const allCards = allPlays.flatMap(p => p.cards);
    
    return { leader, cards: allCards, winner };
  }
  
  // 获取出牌顺序
  private getPlayOrder(leader: Seat): Seat[] {
    const order: Seat[] = ['east', 'north', 'west', 'south'];
    const idx = order.indexOf(leader);
    return [...order.slice(idx), ...order.slice(0, idx)];
  }
  
  // 从手牌移除牌
  private removeCardsFromHand(seat: Seat, cards: Card[]): void {
    const hand = this.state.hands.get(seat) || [];
    // 过滤掉undefined的card
    const validCards = cards.filter(c => c && c.id !== undefined);
    const cardIds = new Set(validCards.map(c => c.id));
    const newHand = hand.filter(c => !cardIds.has(c.id));
    this.state.hands.set(seat, newHand);
  }
  
  // 检查是否杀牌
  private checkIfKill(playCards: Card[], leadCards: Card[]): boolean {
    if (!this.state.ctx) return false;
    
    const allTrump = playCards.every(c => isTrump(c, this.state.ctx!));
    if (!allTrump) return false;
    
    const leadAllTrump = leadCards.every(c => isTrump(c, this.state.ctx!));
    if (leadAllTrump) return false;
    
    const killValidation = validateKill(leadCards, playCards, this.state.ctx);
    
    return killValidation.valid;
  }
  
  // 判定单轮胜者
  private determineTrickWinner(
    allPlays: { seat: Seat; cards: Card[]; isKill: boolean }[],
    leadCards: Card[]
  ): Seat {
    if (!this.state.ctx) return allPlays[0].seat;
    
    // 找出所有杀牌的玩家
    const kills = allPlays.filter(p => p.isKill);
    
    if (kills.length === 0) {
      // 没人杀牌，首家或同门最大的牌胜
      const leadParsed = parseCards(leadCards, this.state.ctx);
      const leadSuit = leadCards[0].suit;
      
      let winner = allPlays[0];
      
      // 找出最大的同门牌
      for (const play of allPlays) {
        // 只比较同门牌
        const sameSuit = play.cards.filter(c => {
          if (isTrump(leadCards[0], this.state.ctx!)) {
            return isTrump(c, this.state.ctx!);
          }
          return c.suit === leadSuit && !isTrump(c, this.state.ctx!);
        });
        
        if (sameSuit.length > 0) {
          // 比较同门牌中最大的
          const maxInPlay = sameSuit.reduce((a, b) => {
            try {
              return cardCompare(a, b, this.state.ctx!) > 0 ? a : b;
            } catch {
              return a; // 如果无法比较，保留当前最大
            }
          });
          
          // 与当前胜者比较
          const winnerSameSuit = winner.cards.filter(c => {
            if (isTrump(leadCards[0], this.state.ctx!)) {
              return isTrump(c, this.state.ctx!);
            }
            return c.suit === leadSuit && !isTrump(c, this.state.ctx!);
          });
          
          if (winnerSameSuit.length > 0) {
            try {
              const maxInWinner = winnerSameSuit.reduce((a, b) => {
                try {
                  return cardCompare(a, b, this.state.ctx!) > 0 ? a : b;
                } catch {
                  return a;
                }
              });
              
              if (cardCompare(maxInPlay, maxInWinner, this.state.ctx) > 0) {
                winner = play;
              }
            } catch {
              // 无法比较，保留当前胜者
            }
          } else {
            winner = play;
          }
        }
      }
      
      return winner.seat;
    }
    
    if (kills.length === 1) {
      return kills[0].seat;
    }
    
    // 多人杀牌，比较大小
    const leadParsed = parseCards(leadCards, this.state.ctx);
    
    let winner = kills[0];
    for (let i = 1; i < kills.length; i++) {
      const result = compareKills(
        leadCards,
        { cards: winner.cards, seat: winner.seat },
        { cards: kills[i].cards, seat: kills[i].seat },
        this.state.ctx
      );
      
      if (result === kills[i].seat) {
        winner = kills[i];
      }
    }
    
    return winner.seat;
  }
  
  // 阶段5：结算
  settlePhase(): void {
    // 计算攻方总分
    const dealerPartner = this.getPartner(this.state.dealer);
    let attackScore = 0;
    
    this.state.scores.forEach((score, seat) => {
      if (!this.isDealerTeam(seat)) {
        attackScore += score;
      }
    });
    
    // 判断最后一轮是否抠底
    const lastWinner = this.state.lastWinner;
    const isKittyTaken = lastWinner && !this.isDealerTeam(lastWinner);
    
    // 计算结果
    const result = calculateResult(
      attackScore,
      this.state.kitty,
      isKittyTaken ? 'attack' : 'defense',
      parseCards(this.state.lastTrick, this.state.ctx!),
      {
        ...this.state.ctx!,
        dealer: this.state.dealer,
        teamLevels: {
          dealer: this.state.level,
          opponent: '2'
        }
      }
    );
    
    this.log('score', '结算完成', {
      attackScore: result.totalScore,
      defenseUpgrade: result.defenseUpgrade,
      attackUpgrade: result.attackUpgrade,
      nextDealer: result.nextDealer
    });
    
    // 升级
    if (result.defenseUpgrade > 0) {
      this.state.level = applyUpgrade(
        this.state.level,
        result.defenseUpgrade,
        ['2', '5', '10', 'K'],
        []
      );
      
      this.log('upgrade', `守方升 ${result.defenseUpgrade} 级`, {
        newLevel: this.state.level
      });
      
      if (checkVictory(this.state.level)) {
        this.state.isOver = true;
        this.state.winner = 'dealer';
        this.log('game_over', '庄家方获胜！');
        return;
      }
    } else if (result.attackUpgrade > 0) {
      // 攻方升级，交庄
      this.state.dealer = result.nextDealer;
      
      this.log('upgrade', `攻方升 ${result.attackUpgrade} 级`, {
        newDealer: this.state.dealer
      });
    } else {
      // 换庄不升级
      this.state.dealer = result.nextDealer;
      
      this.log('upgrade', '换庄不升级', {
        newDealer: this.state.dealer
      });
    }
  }
  
  // 运行一局游戏
  runOneGame(): GameState {
    this.dealCards();
    this.trumpPhase();
    this.discardPhase();  // 庄家先扣底
    this.chaoDiPhase();   // 然后炒底
    this.playPhase();
    this.settlePhase();
    
    return this.state;
  }

  runDealingAndDeclarationRounds(totalRounds: number = 39): DealingPhaseResult {
    const deck = this.prepareDeck();
    this.currentDeck = deck;
    const rounds: DealRoundRecord[] = [];
    const allSeats: Seat[] = ['east', 'north', 'west', 'south'];

    for (let round = 1; round <= totalRounds; round++) {
      const cardsBySeat = this.dealOneRound(deck, round);

      const dealerIdx = allSeats.indexOf(this.state.dealer);
      const declarationOrder: Seat[] = [];
      for (let i = 0; i < 4; i++) {
        declarationOrder.push(allSeats[(dealerIdx + i) % 4]);
      }

      const declarations: DeclarationRecord[] = [];
      for (const seat of declarationOrder) {
        const player = this.players.get(seat);
        if (!player) continue;

        const hand = this.state.hands.get(seat) || [];
        const trumpCards = player.chooseTrump(hand, this.state.level, this.state.trumpState);
        if (trumpCards && trumpCards.length > 0) {
          const success = this.tryDeclare(seat, trumpCards);
          if (success) {
            declarations.push({ seat, cards: trumpCards });
          }
        }
      }

      rounds.push({ round, cardsBySeat, declarationOrder, declarations });
    }

    return { deck, rounds };
  }

  runTrumpAndKittyFlow(): TrumpKittyPhaseResult {
    const deck = this.currentDeck || this.prepareDeckFromCurrentStateIfNeeded();
    this.setKitty(deck);
    const kittyAfterDeal = [...this.state.kitty];

    this.finalizeTrumpPhase();
    const stateAfterFinalize = this.getStateSnapshot();

    this.discardPhase();
    const stateAfterDiscard = this.getStateSnapshot();

    this.chaoDiPhase();
    const stateAfterChaoDi = this.getStateSnapshot();
    const chaoDiLogs = this.logs.filter(l => l.type === 'chaoDi');

    return {
      kittyAfterDeal,
      stateAfterFinalize,
      stateAfterDiscard,
      stateAfterChaoDi,
      chaoDiLogs
    };
  }

  private getStateSnapshot(): GameState {
    return {
      ...this.state,
      hands: new Map([
        ['east', [...(this.state.hands.get('east') || [])]],
        ['north', [...(this.state.hands.get('north') || [])]],
        ['west', [...(this.state.hands.get('west') || [])]],
        ['south', [...(this.state.hands.get('south') || [])]]
      ]),
      kitty: [...this.state.kitty],
      scores: new Map(this.state.scores),
      trumpState: this.state.trumpState ? { ...this.state.trumpState } : this.state.trumpState,
      ctx: this.state.ctx ? { ...this.state.ctx } : this.state.ctx
    };
  }

  private prepareDeckFromCurrentStateIfNeeded(): Card[] {
    const totalDealt = Array.from(this.state.hands.values()).reduce((s, h) => s + h.length, 0);
    if (totalDealt === 156) {
      const deck = new Array<Card>(162);
      const allSeats: Seat[] = ['east', 'north', 'west', 'south'];
      const dealerIdx = allSeats.indexOf(this.state.dealer);
      for (let round = 1; round <= 39; round++) {
        const startIdx = (round - 1) * 4;
        for (let i = 0; i < 4; i++) {
          const seat = allSeats[(dealerIdx + i) % 4];
          const hand = this.state.hands.get(seat) || [];
          const card = hand[round - 1];
          if (card) deck[startIdx + i] = card;
        }
      }
      return deck;
    }
    return this.prepareDeck();
  }
  
  // 获取日志
  getLogs(): GameLog[] {
    return this.logs;
  }
  
  // 获取状态
  getState(): GameState {
    return this.state;
  }
  
  // 从序列化状态恢复
  restoreState(serialized: any): void {
    // Convert arrays back to Maps
    const hands = new Map<Seat, Card[]>();
    if (serialized.hands) {
      for (const [seat, cards] of Object.entries(serialized.hands)) {
        hands.set(seat as Seat, cards as Card[]);
      }
    }
    
    const scores = new Map<Seat, number>();
    if (serialized.scores) {
      for (const [seat, score] of Object.entries(serialized.scores)) {
        scores.set(seat as Seat, score as number);
      }
    }
    
    this.state = {
      level: serialized.level,
      dealer: serialized.dealer,
      hands,
      kitty: serialized.kitty || [],
      trumpState: serialized.trumpState,
      ctx: serialized.ctx || null,
      scores,
      roundNumber: serialized.roundNumber || 0,
      currentLeader: serialized.currentLeader,
      lastTrick: serialized.lastTrick || [],
      lastWinner: serialized.lastWinner || null,
      isOver: serialized.isOver || false,
      winner: serialized.winner || null
    };
  }
  
  // 获取可序列化的状态快照
  getSerializableState(): any {
    return {
      level: this.state.level,
      dealer: this.state.dealer,
      hands: Object.fromEntries(this.state.hands),
      kitty: this.state.kitty,
      trumpState: this.state.trumpState,
      ctx: this.state.ctx,
      scores: Object.fromEntries(this.state.scores),
      roundNumber: this.state.roundNumber,
      currentLeader: this.state.currentLeader,
      lastTrick: this.state.lastTrick,
      lastWinner: this.state.lastWinner,
      isOver: this.state.isOver,
      winner: this.state.winner
    };
  }
}

// 导出工厂函数
export function createGameEngine(startLevel: Rank = '2', startDealer: Seat = 'east', isGrabMode: boolean = false, seed?: number): GameEngine {
  return new GameEngine(startLevel, startDealer, isGrabMode, seed);
}
