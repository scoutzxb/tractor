// M8: 游戏主循环 - 串联M1-M7实现完整游戏流程

import type { Card, GameContext, Seat, Rank, Suit } from '../core/types';
import { createDeck, shuffle, deal, sortHand, cardCompare, isTrump } from '../core/deck';
import { parseCards } from '../core/parser';
import { validateLeadPlay } from '../core/lead-validator';
import { validateFollowPlay, autoCompleteFollow } from '../core/follow-validator';
import { validateKill, compareKills } from '../core/kill-validator';
import { getPointCards, getKittyMultiplier, calculateResult, applyUpgrade, checkVictory } from '../core/scoring';
import {
  createTrumpState,
  declare,
  canDeclare,
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
  
  // 亮主阶段
  chooseTrump(hand: Card[], level: Rank, state: TrumpState): Card[] | null;
  
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

// 回合引擎
export class GameEngine {
  private state: GameState;
  private players: Map<Seat, Player>;
  private logs: GameLog[] = [];
  
  constructor(startLevel: Rank = '2', startDealer: Seat = 'east') {
    this.state = this.createInitialState(startLevel, startDealer);
    this.players = new Map();
  }
  
  // 创建初始状态
  private createInitialState(level: Rank, dealer: Seat): GameState {
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
      trumpState: createTrumpState(false), // 常规局
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
    
    // 检查是否全是主牌
    const allTrump = playCards.every(c => isTrump(c, this.state.ctx!));
    if (!allTrump) return false;
    
    // 检查首家是否是副牌
    const leadAllTrump = leadCards.every(c => isTrump(c, this.state.ctx!));
    if (leadAllTrump) return false;
    
    // 验证杀牌结构
    const leadParsed = parseCards(leadCards, this.state.ctx);
    const killValidation = validateKill(leadParsed, playCards, this.state.ctx);
    
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
        leadParsed,
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
    this.discardPhase();
    this.playPhase();
    this.settlePhase();
    
    return this.state;
  }
  
  // 获取日志
  getLogs(): GameLog[] {
    return this.logs;
  }
  
  // 获取状态
  getState(): GameState {
    return this.state;
  }
}

// 导出工厂函数
export function createGameEngine(startLevel: Rank = '2', startDealer: Seat = 'east'): GameEngine {
  return new GameEngine(startLevel, startDealer);
}
