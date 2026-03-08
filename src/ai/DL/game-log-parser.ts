/**
 * 对局日志解析器
 * 
 * 解析 game-logs-xxx 目录下的 Markdown 日志
 * 提取游戏状态和出牌事件，连接公共信息编码器
 */

import type { Card, GameContext, Seat, Suit, Rank } from '../../core/types';
import { PublicInfoEncoder, type PublicInfoTensor, type PublicInfoState } from './public-info-encoder';
import * as fs from 'fs';
import * as path from 'path';

// ===== 日志数据结构 =====

/** 解析后的游戏信息 */
export interface ParsedGame {
  /** 游戏编号 */
  gameId: number;
  
  /** 是否抢庄局 */
  isGrabMode: boolean;
  
  /** 庄家 */
  dealer: Seat;
  
  /** 东西队级别 */
  eastWestLevel: Rank;
  
  /** 南北队级别 */
  northSouthLevel: Rank;
  
  /** 主花色 */
  trumpSuit: Suit | null;
  
  /** 底牌 */
  kitty: Card[];
  
  /** 初始手牌 */
  initialHands: Map<Seat, Card[]>;
  
  /** 出牌记录 */
  playRounds: PlayRound[];
  
  /** 最终得分 */
  finalScores: Map<Seat, number>;
  
  /** 最终结果 */
  result: {
    defenseUpgrade: number;
    attackUpgrade: number;
    winner: 'dealer' | 'opponent';
  };
}

/** 单轮出牌 */
export interface PlayRound {
  /** 轮次 */
  round: number;
  
  /** 首家 */
  leader: Seat;
  
  /** 出牌顺序 */
  playOrder: Seat[];
  
  /** 各家出牌 */
  plays: PlayEvent[];
  
  /** 获胜者 */
  winner: Seat;
  
  /** 得分 */
  score: number;
  
  /** 甩牌失败信息（如果有） */
  throwFail?: {
    seat: Seat;
    attempted: Card[];
    actual: Card[];
    reason: string;
  };
  
  /** 剩余手牌（日志中记录的） */
  remainingHands?: Map<Seat, Card[]>;
  
  /** 累计得分 */
  cumulativeScore?: {
    dealerTeam: number;
    attackTeam: number;
  };
}

/** 单个出牌事件 */
export interface PlayEvent {
  /** 座位 */
  seat: Seat;
  
  /** 出的牌 */
  cards: Card[];
  
  /** 是否杀牌 */
  isKill?: boolean;
  
  /** 是否首家 */
  isLeader: boolean;
}

// ===== 解析工具 =====

/** 花色符号映射 */
const SUIT_SYMBOLS: Record<string, Suit> = {
  '♠': 'spade',
  '♥': 'heart',
  '♣': 'club',
  '♦': 'diamond'
};

/** 点数映射 */
const RANK_MAP: Record<string, Rank> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A'
};

/** 座位映射 */
const SEAT_MAP: Record<string, Seat> = {
  '东': 'east',
  '北': 'north',
  '西': 'west',
  '南': 'south'
};

/** 卡牌ID计数器 */
let cardIdCounter = 0;

/** 重置卡牌ID计数器 */
function resetCardIdCounter(): void {
  cardIdCounter = 0;
}

/** 解析单张牌 */
function parseCard(str: string): Card | null {
  // 处理王牌
  if (str === '大王') {
    return { id: cardIdCounter++, joker: 'big' };
  }
  if (str === '小王') {
    return { id: cardIdCounter++, joker: 'small' };
  }
  
  // 处理普通牌：格式为 ♠A, ♥10 等
  const suitSymbol = str[0];
  const rankStr = str.slice(1);
  
  const suit = SUIT_SYMBOLS[suitSymbol];
  const rank = RANK_MAP[rankStr];
  
  if (!suit || !rank) {
    return null;
  }
  
  return { id: cardIdCounter++, suit, rank };
}

/** 解析多张牌（空格分隔） */
function parseCards(str: string): Card[] {
  const cards: Card[] = [];
  const parts = str.trim().split(/\s+/);
  
  for (const part of parts) {
    const card = parseCard(part);
    if (card) {
      cards.push(card);
    }
  }
  
  return cards;
}

/** 解析座位 */
function parseSeat(str: string): Seat | null {
  return SEAT_MAP[str] || null;
}

/** 判断是否是主牌 */
function isTrumpCard(card: Card, trumpSuit: Suit | null, level: Rank): boolean {
  if (card.joker) return true;
  if (card.rank === level) return true;
  if (card.suit === trumpSuit) return true;
  return false;
}

// ===== 日志解析器类 =====

export class GameLogParser {
  private lines: string[] = [];
  private currentLine: number = 0;
  
  /** 解析日志文件 */
  parseFile(filepath: string): ParsedGame | null {
    const content = fs.readFileSync(filepath, 'utf-8');
    return this.parseContent(content);
  }
  
  /** 解析日志内容 */
  parseContent(content: string): ParsedGame | null {
    resetCardIdCounter();
    this.lines = content.split('\n');
    this.currentLine = 0;
    
    const game: Partial<ParsedGame> = {
      gameId: 0,
      playRounds: [],
      initialHands: new Map(),
      finalScores: new Map(),
      kitty: []
    };
    
    // 解析头部信息
    this.parseHeader(game);
    
    // 解析抓牌阶段
    this.parseDealPhase(game);
    
    // 解析亮主/底牌阶段
    this.parseTrumpPhase(game);
    
    // 解析初始手牌
    this.parseInitialHands(game);
    
    // 解析出牌阶段
    this.parsePlayPhase(game);
    
    // 解析结尾
    this.parseEnding(game);
    
    return game as ParsedGame;
  }
  
  /** 解析头部 */
  private parseHeader(game: Partial<ParsedGame>): void {
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 检测是否抢庄局
      if (line.includes('抢庄局')) {
        game.isGrabMode = true;
      }
      
      // 解析庄家
      const dealerMatch = line.match(/庄家:\s*(东|北|西|南)/);
      if (dealerMatch) {
        game.dealer = parseSeat(dealerMatch[1])!;
      }
      
      // 解析级别
      const levelMatch = line.match(/东西级别:\s*(\S+),\s*南北级别:\s*(\S+)/);
      if (levelMatch) {
        game.eastWestLevel = levelMatch[1] as Rank;
        game.northSouthLevel = levelMatch[2] as Rank;
      }
      
      // 进入下一阶段
      if (line.includes('抓牌阶段')) {
        this.currentLine++;
        break;
      }
      
      this.currentLine++;
    }
  }
  
  /** 解析抓牌阶段 */
  private parseDealPhase(game: Partial<ParsedGame>): void {
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 检测亮主
      if (line.includes('亮主')) {
        const match = line.match(/(东|北|西|南)\s+亮主:\s*(.+)/);
        if (match) {
          // 亮主信息，会在后面确认
        }
      }
      
      // 进入下一阶段
      if (line.includes('亮主/底牌/扣底/炒底阶段')) {
        this.currentLine++;
        break;
      }
      
      this.currentLine++;
    }
  }
  
  /** 解析亮主阶段 */
  private parseTrumpPhase(game: Partial<ParsedGame>): void {
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 解析底牌
      if (line.startsWith('底牌:')) {
        game.kitty = parseCards(line.slice(3));
      }
      
      // 解析主花色
      const trumpMatch = line.match(/主花色:\s*(♠|♥|♣|♦)/);
      if (trumpMatch) {
        game.trumpSuit = SUIT_SYMBOLS[trumpMatch[1]];
      }
      
      // 更新庄家（抢庄局）
      if (line.includes('成为庄家') && game.isGrabMode) {
        const dealerMatch = line.match(/(东|北|西|南)\s+成为庄家/);
        if (dealerMatch) {
          game.dealer = parseSeat(dealerMatch[1])!;
        }
      }
      
      // 进入初始手牌
      if (line.includes('初始手牌')) {
        this.currentLine++;
        break;
      }
      
      this.currentLine++;
    }
  }
  
  /** 解析初始手牌 */
  private parseInitialHands(game: Partial<ParsedGame>): void {
    let currentSeat: Seat | null = null;
    let currentCards: Card[] = [];
    
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 检测座位行
      const seatMatch = line.match(/^(东|北|西|南)\s*(?:【庄家】)?\s*\(\d+张\):/);
      if (seatMatch) {
        // 保存上一个座位的手牌
        if (currentSeat && currentCards.length > 0) {
          game.initialHands!.set(currentSeat, currentCards);
        }
        
        currentSeat = parseSeat(seatMatch[1]);
        currentCards = [];
        this.currentLine++;
        continue;
      }
      
      // 解析手牌行
      if (currentSeat && line.startsWith('  【')) {
        // 格式: 【主牌】... 或 【♠】...
        const cardsStr = line.replace(/^\s*【[^】]+】\s*/, '');
        const cards = parseCards(cardsStr);
        currentCards.push(...cards);
      }
      
      // 进入出牌阶段
      if (line.includes('出牌阶段')) {
        // 保存最后一个座位的手牌
        if (currentSeat && currentCards.length > 0) {
          game.initialHands!.set(currentSeat, currentCards);
        }
        this.currentLine++;
        break;
      }
      
      this.currentLine++;
    }
  }
  
  /** 解析出牌阶段 */
  private parsePlayPhase(game: Partial<ParsedGame>): void {
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 检测轮次
      const roundMatch = line.match(/第\s*(\d+)\s*轮/);
      if (roundMatch) {
        const round = this.parsePlayRound(parseInt(roundMatch[1]), game);
        if (round) {
          game.playRounds!.push(round);
        }
        continue;
      }
      
      // 检测结尾
      if (line.includes('获胜') || line.includes('结算')) {
        break;
      }
      
      this.currentLine++;
    }
  }
  
  /** 解析单轮出牌 */
  private parsePlayRound(roundNum: number, game: Partial<ParsedGame>): PlayRound | null {
    const round: Partial<PlayRound> = {
      round: roundNum,
      plays: [],
      playOrder: []
    };
    
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 解析出牌顺序
      const orderMatch = line.match(/出牌顺序:\s*(东|北|西|南)\s*->\s*(东|北|西|南)\s*->\s*(东|北|西|南)\s*->\s*(东|北|西|南)/);
      if (orderMatch) {
        round.playOrder = [orderMatch[1], orderMatch[2], orderMatch[3], orderMatch[4]].map(s => parseSeat(s)!);
        round.leader = round.playOrder[0];
        this.currentLine++;
        continue;
      }
      
      // 解析甩牌失败
      if (line.includes('试图甩牌')) {
        const seatMatch = line.match(/⚠️\s*(东|北|西|南)\s+试图甩牌:\s*(.+)/);
        if (seatMatch) {
          const seat = parseSeat(seatMatch[1]);
          const attempted = parseCards(seatMatch[2]);
          
          // 下一行是失败原因
          this.currentLine++;
          const failLine = this.lines[this.currentLine];
          const reasonMatch = failLine.match(/甩牌失败:\s*(.+)/);
          const reason = reasonMatch ? reasonMatch[1] : '';
          
          // 再下一行是实际出牌
          this.currentLine++;
          const actualLine = this.lines[this.currentLine];
          const actualMatch = actualLine.match(/按规则改出:\s*(.+)/);
          const actual = actualMatch ? parseCards(actualMatch[1]) : [];
          
          round.throwFail = { seat, attempted, actual, reason };
        }
        this.currentLine++;
        continue;
      }
      
      // 解析出牌
      const playMatch = line.match(/^(东|北|西|南)(?:\s*\(首家\))?:\s*(.+)/);
      if (playMatch) {
        const seat = parseSeat(playMatch[1]);
        const cards = parseCards(playMatch[2]);
        const isLeader = line.includes('(首家)');
        
        // 判断是否杀牌（需要在后续判断）
        round.plays!.push({
          seat: seat!,
          cards,
          isLeader,
          isKill: false // 后续更新
        });
        this.currentLine++;
        continue;
      }
      
      // 解析获胜信息
      const winMatch = line.match(/🏆\s*(东|北|西|南)\s+赢得此轮！获得\s*(\d+)\s*分/);
      if (winMatch) {
        round.winner = parseSeat(winMatch[1])!;
        round.score = parseInt(winMatch[2]);
        this.currentLine++;
        continue;
      }
      
      // 解析累计得分
      const scoreMatch = line.match(/庄家方\s*\(南\s*\+\s*北\):\s*(\d+)\s*分/);
      const attackScoreMatch = line.match(/防家方:\s*(\d+)\s*分/);
      if (scoreMatch && attackScoreMatch) {
        round.cumulativeScore = {
          dealerTeam: parseInt(scoreMatch[1]),
          attackTeam: parseInt(attackScoreMatch[1])
        };
        this.currentLine++;
        continue;
      }
      
      // 进入下一轮，结束当前轮解析
      if (line.match(/第\s*\d+\s*轮/) || line.includes('获胜') || line.includes('结算')) {
        break;
      }
      
      this.currentLine++;
    }
    
    // 判断杀牌
    this.detectKills(round as PlayRound, game);
    
    return round as PlayRound;
  }
  
  /** 检测杀牌 */
  private detectKills(round: PlayRound, game: Partial<ParsedGame>): void {
    if (round.plays.length < 2) return;
    
    const leader = round.plays[0];
    const leaderSuit = leader.cards[0]?.suit;
    const ctx: GameContext = {
      level: game.eastWestLevel || '2',
      trumpSuit: game.trumpSuit || null
    };
    
    // 判断首家是否出主牌
    const leaderIsTrump = leader.cards.every(c => isTrumpCard(c, ctx.trumpSuit, ctx.level));
    
    for (let i = 1; i < round.plays.length; i++) {
      const play = round.plays[i];
      
      // 判断是否杀牌：
      // 1. 首家出的不是主牌
      // 2. 跟牌者全部出主牌
      if (!leaderIsTrump && play.cards.every(c => isTrumpCard(c, ctx.trumpSuit, ctx.level))) {
        play.isKill = true;
      }
    }
  }
  
  /** 解析结尾 */
  private parseEnding(game: Partial<ParsedGame>): void {
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      
      // 解析最终结果
      if (line.includes('庄家方获胜')) {
        game.result = {
          defenseUpgrade: 0, // 后续解析
          attackUpgrade: 0,
          winner: 'dealer'
        };
      }
      
      if (line.includes('防家方获胜')) {
        game.result = {
          defenseUpgrade: 0,
          attackUpgrade: 0,
          winner: 'opponent'
        };
      }
      
      // 解析换庄
      const dealerMatch = line.match(/换庄到\s*(东|北|西|南)/);
      if (dealerMatch) {
        // 下一局的庄家
      }
      
      this.currentLine++;
    }
  }
}

// ===== 公共信息生成器 =====

/** 单轮公共信息快照 */
export interface RoundPublicInfo {
  /** 轮次 */
  round: number;
  
  /** 公共信息张量 */
  tensor: PublicInfoTensor;
  
  /** 公共信息状态 */
  state: PublicInfoState;
  
  /** 人类可读格式 */
  humanReadable: string;
}

/** 解析并生成公共信息 */
export class GameLogProcessor {
  private parser = new GameLogParser();
  
  /** 处理单个日志文件 */
  processFile(logPath: string): {
    game: ParsedGame;
    roundInfos: RoundPublicInfo[];
  } | null {
    const game = this.parser.parseFile(logPath);
    if (!game) return null;
    
    const roundInfos = this.generateRoundInfos(game);
    return { game, roundInfos };
  }
  
  /** 生成每轮公共信息 */
  private generateRoundInfos(game: ParsedGame): RoundPublicInfo[] {
    const ctx: GameContext = {
      level: game.eastWestLevel,
      trumpSuit: game.trumpSuit
    };
    
    const encoder = new PublicInfoEncoder(ctx, game.dealer);
    const roundInfos: RoundPublicInfo[] = [];
    
    for (const round of game.playRounds) {
      // 处理每家的出牌
      for (const play of round.plays) {
        encoder.processPlay(play.seat, play.cards, play.isKill);
      }
      
      // 处理轮次结束
      encoder.processTrickEnd(round.winner, round.score);
      
      // 生成快照
      const tensor = encoder.encode();
      const state = encoder.getState();
      const humanReadable = this.formatHumanReadable(round, tensor, state, game);
      
      roundInfos.push({
        round: round.round,
        tensor,
        state,
        humanReadable
      });
    }
    
    return roundInfos;
  }
  
  /** 格式化人类可读输出 */
  private formatHumanReadable(
    round: PlayRound,
    tensor: PublicInfoTensor,
    state: PublicInfoState,
    game: ParsedGame
  ): string {
    const lines: string[] = [];
    
    lines.push(`\n${'='.repeat(60)}`);
    lines.push(`第 ${round.round} 轮公共信息快照`);
    lines.push(`${'='.repeat(60)}`);
    
    // 游戏状态
    lines.push(`\n【游戏状态】`);
    lines.push(`  主花色: ${game.trumpSuit ? this.formatSuit(game.trumpSuit) : '无主'}`);
    lines.push(`  庄家: ${this.formatSeat(game.dealer)}`);
    lines.push(`  轮次: ${tensor.roundNumber}/39`);
    
    // 得分情况
    lines.push(`\n【得分情况】`);
    lines.push(`  攻方累计: ${tensor.attackScore} 分`);
    lines.push(`  本轮得分: ${round.score} 分 (${this.formatSeat(round.winner)} 获胜)`);
    
    // 出牌记录
    lines.push(`\n【本轮出牌】`);
    for (const play of round.plays) {
      const cardsStr = play.cards.map(c => this.formatCard(c)).join(' ');
      const typeStr = play.isLeader ? '领出' : (play.isKill ? '杀牌' : '跟牌');
      lines.push(`  ${this.formatSeat(play.seat)}: ${cardsStr} [${typeStr}]`);
    }
    
    // 甩牌失败（如果有）
    if (round.throwFail) {
      lines.push(`\n【甩牌失败】`);
      lines.push(`  ${this.formatSeat(round.throwFail.seat)} 试图甩: ${round.throwFail.attempted.map(c => this.formatCard(c)).join(' ')}`);
      lines.push(`  原因: ${round.throwFail.reason}`);
      lines.push(`  改出: ${round.throwFail.actual.map(c => this.formatCard(c)).join(' ')}`);
    }
    
    // 已出牌统计
    lines.push(`\n【已出牌统计】`);
    const suits = ['主牌', '♠', '♥', '♣', '♦'];
    for (let i = 0; i < 4; i++) {
      const row = tensor.playedCardsMatrix[i];
      const total = row.reduce((s, v) => s + v, 0);
      lines.push(`  ${suits[i]}: 已出 ${Math.round(total)} 张`);
    }
    
    // 分数牌统计
    lines.push(`\n【分数牌统计】`);
    lines.push(`  5: 已出 ${Math.round(tensor.scoreCardsPlayed[0])} 张`);
    lines.push(`  10: 已出 ${Math.round(tensor.scoreCardsPlayed[1])} 张`);
    lines.push(`  K: 已出 ${Math.round(tensor.scoreCardsPlayed[2])} 张`);
    
    // Void推断
    lines.push(`\n【Void推断】`);
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    const suitNames = ['主牌', '♠', '♥', '♣', '♦'];
    let hasVoid = false;
    for (let i = 0; i < 4; i++) {
      const voids: string[] = [];
      for (let j = 0; j < 4; j++) {
        if (tensor.voidMatrix[i][j]) {
          voids.push(suitNames[j + 1]); // 跳过主牌列
          hasVoid = true;
        }
      }
      if (voids.length > 0) {
        lines.push(`  ${this.formatSeat(seats[i])}: void ${voids.join(', ')}`);
      }
    }
    if (!hasVoid) {
      lines.push(`  暂无void推断`);
    }
    
    return lines.join('\n');
  }
  
  /** 格式化座位 */
  private formatSeat(seat: Seat): string {
    const map: Record<Seat, string> = {
      east: '东',
      north: '北',
      west: '西',
      south: '南'
    };
    return map[seat];
  }
  
  /** 格式化花色 */
  private formatSuit(suit: Suit): string {
    const map: Record<Suit, string> = {
      spade: '♠',
      heart: '♥',
      club: '♣',
      diamond: '♦'
    };
    return map[suit];
  }
  
  /** 格式化卡牌 */
  private formatCard(card: Card): string {
    if (card.joker) {
      return card.joker === 'big' ? '大王' : '小王';
    }
    return this.formatSuit(card.suit!) + card.rank;
  }
}

// ===== 导出 =====

export { PublicInfoEncoder };