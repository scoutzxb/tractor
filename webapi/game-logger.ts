/**
 * Game Logger for Web UI
 * Records complete game logs similar to run-multi-round-logs.ts output
 */

import type { Card, Seat, Rank, Suit, GameContext } from "../src/core/types";
import { SUIT_NAMES, sortHand } from "../src/core/deck";
import { getPartner } from "../src/core/scoring";
import type { Session } from "../web-deal-service";
import * as fs from "fs";
import * as path from "path";

// Seat names in Chinese
const SEAT_NAMES: Record<Seat, string> = {
  east: "东",
  north: "北",
  west: "西",
  south: "南",
};

// Format a single card
function formatCard(card: Card | string): string {
  if (!card) return "?";
  if (typeof card === "string") return card;
  if (card.joker) return card.joker === "big" ? "大王" : "小王";
  return `${SUIT_NAMES[card.suit!]}${card.rank}`;
}

// Format multiple cards
function formatCards(cards: (Card | string)[]): string {
  return cards.map(card => {
    if (typeof card === "string") {
      const suitMap: Record<string, string> = {
        'spade': '♠', 'heart': '♥', 'club': '♣', 'diamond': '♦',
        'big': '大王', 'small': '小王'
      };
      for (const [eng, symbol] of Object.entries(suitMap)) {
        if (card.includes(eng)) {
          if (eng === 'big' || eng === 'small') return symbol;
          return symbol + card.replace(eng, '');
        }
      }
      return card;
    }
    return formatCard(card);
  }).join(" ");
}

// Display hand sorted by suit and trump
function displayHand(hand: Card[], ctx: GameContext): string {
  const validHand = hand.filter(c => c != null);
  const sorted = sortHand([...validHand], ctx);
  const parts: string[] = [];

  // Trump cards
  const trumpCards = sorted.filter(c => {
    if (c.joker) return true;
    if (c.rank === ctx.level) return true;
    if (ctx.trumpSuit && c.suit === ctx.trumpSuit) return true;
    return false;
  });

  if (trumpCards.length > 0) {
    const bigJokers = trumpCards.filter(c => c.joker === 'big');
    const smallJokers = trumpCards.filter(c => c.joker === 'small');
    const levelCards = trumpCards.filter(c => c.rank === ctx.level && !c.joker);
    const trumpSuitCards = trumpCards.filter(c => c.suit === ctx.trumpSuit && c.rank !== ctx.level);

    // Sort level cards: trump suit first, then by suit order
    const suitOrder = ['spade', 'heart', 'club', 'diamond'];
    levelCards.sort((a, b) => {
      if (a.suit === ctx.trumpSuit && b.suit !== ctx.trumpSuit) return -1;
      if (b.suit === ctx.trumpSuit && a.suit !== ctx.trumpSuit) return 1;
      return suitOrder.indexOf(a.suit!) - suitOrder.indexOf(b.suit!);
    });

    const ordered = [...bigJokers, ...smallJokers, ...levelCards, ...trumpSuitCards];
    const display = ordered.map(c => {
      if (c.joker) return c.joker === 'big' ? '大王' : '小王';
      return `${SUIT_NAMES[c.suit!]}${c.rank}`;
    }).join(' ');
    parts.push(`【主牌】${display}`);
  }

  // Non-trump suits
  const suits: ('spade' | 'heart' | 'club' | 'diamond')[] = ['spade', 'heart', 'club', 'diamond'];
  for (const suit of suits) {
    if (suit === ctx.trumpSuit) continue;
    const suitCards = sorted.filter(c => c.suit === suit && c.rank !== ctx.level);
    if (suitCards.length > 0) {
      const display = suitCards.map(c => `${SUIT_NAMES[c.suit!]}${c.rank}`).join(' ');
      parts.push(`【${SUIT_NAMES[suit]}】${display}`);
    }
  }

  return parts.join('\n  ');
}

// ============================================================================
// Game Logger Class
// ============================================================================

export class GameLogger {
  private logLines: string[] = [];
  private gameNumber: number;
  private sessionId: string;
  private outputDir: string;
  private dealingRounds: Array<{
    round: number;
    cardsBySeat: Map<Seat, Card>;
    declarations: Array<{ seat: Seat; cards: Card[] }>;
  }> = [];
  private kittyCards: Card[] = [];
  private originalKittyCards: Card[] = [];  // 原始底牌（发牌后的6张）
  private trumpInfo: {
    declarer: Seat | null;
    suit: Suit | null;
    cards: Card[];
    isNoTrump: boolean;
  } | null = null;
  private chaoDiRounds: Array<{
    seat: Seat;
    cards: Card[];
    success: boolean;
    newTrump: { suit: Suit | null; isNoTrump: boolean } | null;
    receivedKitty: Card[];
    discardedKitty: Card[];
  }> = [];
  private initialHands: Map<Seat, Card[]> = new Map();
  private tricks: Array<{
    round: number;
    leader: Seat;
    plays: Array<{ seat: Seat; cards: Card[] }>;
    winner: Seat;
    points: number;
    throwFailure?: {
      seat: Seat;
      attemptedCards: Card[];
      reason: string;
      fallbackCards: Card[];
    };
  }> = [];
  private finalScores: Map<Seat, number> = new Map();
  private gameResult: {
    dealerTeamScore: number;
    defenderTeamScore: number;
    kittyBaseScore?: number;      // 底牌原始分数
    kittyMultiplier?: number;     // 抠底倍数
    kittyScore?: number;          // 抠底得分
    isKittyTaken?: boolean;       // 是否抠底
    totalScore?: number;          // 防家总分（含抠底）
    winner: 'dealer' | 'defender';
    nextDealer: Seat;
    nextLevel: Rank;
  } | null = null;
  private isGrabMode: boolean = false;
  private hasRecordedOriginalKitty: boolean = false;  // 是否已记录原始底牌
  private dealerKitty: {
    seat: Seat;
    received: Card[];
    discarded: Card[];
  } | null = null;

  // Game state captured at start (doesn't change)
  private gameStartDealer: Seat | null = null;
  private gameStartTeamLevels: { eastWest: Rank; northSouth: Rank } | null = null;
  private filePath: string | null = null;

  constructor(gameNumber: number, outputDir: string = "game-logs-web", sessionId?: string) {
    this.gameNumber = gameNumber;
    this.sessionId = sessionId || `game_${gameNumber}`;
    this.outputDir = outputDir;
  }

  // Set game mode
  setGrabMode(isGrab: boolean): void {
    this.isGrabMode = isGrab;
  }

  // Capture game start state (dealer and team levels at game start)
  setGameStartState(dealer: Seat, teamLevels: { eastWest: Rank; northSouth: Rank }): void {
    this.gameStartDealer = dealer;
    this.gameStartTeamLevels = { ...teamLevels };
  }

  // Record a dealing round
  recordDealingRound(round: number, cardsBySeat: Map<Seat, Card>, declarations: Array<{ seat: Seat; cards: Card[] }>): void {
    this.dealingRounds.push({ round, cardsBySeat: new Map(cardsBySeat), declarations: [...declarations] });
  }

  // Record kitty cards
  recordKitty(cards: Card[]): void {
    // 只在第一次调用时记录原始底牌
    if (!this.hasRecordedOriginalKitty) {
      this.originalKittyCards = [...cards];
      this.hasRecordedOriginalKitty = true;
    }
    this.kittyCards = [...cards];
  }

  // Record trump declaration
  recordTrump(declarer: Seat, suit: Suit | null, cards: Card[], isNoTrump: boolean = false): void {
    this.trumpInfo = { declarer, suit, cards: [...cards], isNoTrump };
  }

  // Record a chao-di event
  recordChaoDi(seat: Seat, cards: Card[], success: boolean, newTrump: { suit: Suit | null; isNoTrump: boolean } | null, receivedKitty: Card[], discardedKitty: Card[]): void {
    this.chaoDiRounds.push({
      seat,
      cards: [...cards],
      success,
      newTrump,
      receivedKitty: [...receivedKitty],
      discardedKitty: [...discardedKitty],
    });
    if (success) {
      this.kittyCards = [...discardedKitty];
    }
  }

  // Record initial hands after trump is set
  recordInitialHands(hands: Map<Seat, Card[]>, ctx: GameContext): void {
    for (const [seat, hand] of hands) {
      this.initialHands.set(seat, [...hand]);
    }
  }

  // Record a trick
  recordTrick(trick: {
    round: number;
    leader: Seat;
    plays: Array<{ seat: Seat; cards: Card[] }>;
    winner: Seat;
    points: number;
    throwFailure?: {
      seat: Seat;
      attemptedCards: Card[];
      reason: string;
      fallbackCards: Card[];
    };
  }): void {
    this.tricks.push({
      ...trick,
      plays: trick.plays.map(p => ({ seat: p.seat, cards: [...p.cards] })),
    });
  }

  // Record final scores
  recordFinalScores(scores: Map<Seat, number>): void {
    this.finalScores = new Map(scores);
  }

  // Record game result
  recordGameResult(result: {
    dealerTeamScore: number;
    defenderTeamScore: number;
    kittyBaseScore?: number;      // 底牌原始分数
    kittyMultiplier?: number;     // 抠底倍数
    kittyScore?: number;          // 抠底得分
    isKittyTaken?: boolean;       // 是否抠底
    totalScore?: number;          // 防家总分（含抠底）
    winner: 'dealer' | 'defender';
    nextDealer: Seat;
    nextLevel: Rank;
  }): void {
    this.gameResult = {
      dealerTeamScore: result.dealerTeamScore,
      defenderTeamScore: result.defenderTeamScore,
      kittyBaseScore: result.kittyBaseScore ?? 0,
      kittyMultiplier: result.kittyMultiplier ?? 1,
      kittyScore: result.kittyScore ?? 0,
      isKittyTaken: result.isKittyTaken ?? false,
      totalScore: result.totalScore ?? result.defenderTeamScore,
      winner: result.winner,
      nextDealer: result.nextDealer,
      nextLevel: result.nextLevel,
    };
  }

  // Record dealer's kitty handling (what they received and put back)
  recordDealerKitty(seat: Seat, received: Card[], discarded: Card[]): void {
    this.dealerKitty = { seat, received: [...received], discarded: [...discarded] };
    this.kittyCards = [...discarded];
  }

  // Generate the log content
  private generateLogContent(dealer: Seat, teamLevels: { eastWest: Rank; northSouth: Rank }, ctx: GameContext | null): string {
    const lines: string[] = [];

    // Header
    lines.push("=".repeat(80));
    lines.push(`=== 第 ${this.gameNumber} 局${this.isGrabMode ? ' (抢庄局)' : ' (普通局)'} ===`);
    lines.push(`庄家: ${SEAT_NAMES[dealer]}, 东西级别: ${teamLevels.eastWest}, 南北级别: ${teamLevels.northSouth}`);
    lines.push("=".repeat(80));

    // Dealing phase
    lines.push("\n--- 抓牌阶段 ---\n");
    for (const round of this.dealingRounds) {
      lines.push(`第 ${round.round} 轮:`);
      const seats: Seat[] = ['east', 'north', 'west', 'south'];
      const dealerIdx = seats.indexOf(dealer);
      for (let i = 0; i < 4; i++) {
        const seatIdx = (dealerIdx + i) % 4;
        const seat = seats[seatIdx];
        const card = round.cardsBySeat.get(seat);
        if (card) {
          lines.push(`  ${SEAT_NAMES[seat]}: ${formatCard(card)}`);
        }
      }
      for (const decl of round.declarations) {
        lines.push(`  📣 ${SEAT_NAMES[decl.seat]} 亮主: ${formatCards(decl.cards)}`);
      }
      lines.push("");
    }

    // Trump/Kitty phase
    lines.push("--- 亮主/底牌/扣底/炒底阶段 ---\n");
    lines.push(`底牌: ${formatCards(this.originalKittyCards.length > 0 ? this.originalKittyCards : this.kittyCards)}\n`);

    if (this.trumpInfo) {
      const cardCount = this.trumpInfo.cards.length;
      const countLabel = cardCount === 2 ? '一对' : cardCount === 3 ? '三张' : `${cardCount}张`;
      
      // Determine what was used to declare
      let cardTypeLabel = '';
      if (this.trumpInfo.isNoTrump) {
        const hasBigJoker = this.trumpInfo.cards.some(c => c.joker === 'big');
        const hasSmallJoker = this.trumpInfo.cards.some(c => c.joker === 'small');
        if (hasBigJoker && hasSmallJoker) {
          cardTypeLabel = '大小王';
        } else if (hasBigJoker) {
          cardTypeLabel = '大王';
        } else if (hasSmallJoker) {
          cardTypeLabel = '小王';
        }
      } else {
        cardTypeLabel = SUIT_NAMES[this.trumpInfo.suit!];
      }
      
      lines.push(`✅ ${SEAT_NAMES[this.trumpInfo.declarer!]} 亮主成功`);
      lines.push(`   主花色: ${this.trumpInfo.isNoTrump ? '无主' : SUIT_NAMES[this.trumpInfo.suit!]}`);
      lines.push(`   亮主牌: ${countLabel}${cardTypeLabel} (${formatCards(this.trumpInfo.cards)})`);
      if (this.isGrabMode && this.trumpInfo.declarer !== dealer) {
        lines.push(`   🎯 ${SEAT_NAMES[this.trumpInfo.declarer!]} 成为庄家 (抢庄成功)`);
      }
      lines.push(`   庄家: ${SEAT_NAMES[dealer]}\n`);
    } else {
      lines.push(`❌ 无人亮主，翻底牌决定主花色\n`);
    }

    // Dealer's kitty handling
    if (this.dealerKitty) {
      lines.push(`📦 ${SEAT_NAMES[this.dealerKitty.seat]} 拿底扣底:`);
      lines.push(`   获得底牌: ${formatCards(this.dealerKitty.received)}`);
      lines.push(`   扣回底牌: ${formatCards(this.dealerKitty.discarded)}\n`);
    }

    // ChaoDi phase
    if (this.chaoDiRounds.length > 0) {
      lines.push("--- 炒底阶段 ---\n");
      for (let i = 0; i < this.chaoDiRounds.length; i++) {
        const cd = this.chaoDiRounds[i];
        lines.push(`炒底第 ${i + 1} 轮:`);
        if (cd.success) {
          const cardsLabel = cd.cards.length === 2 ? '一对' : cd.cards.length === 3 ? '三张' : `${cd.cards.length}张`;
          const suitLabel = cd.cards[0].joker
            ? (cd.cards[0].joker === 'big' ? '大王' : '小王')
            : SUIT_NAMES[cd.cards.find(c => !c.joker)?.suit!];
          lines.push(`  🔥 ${SEAT_NAMES[cd.seat]} 炒底成功: ${cardsLabel}${suitLabel} (${formatCards(cd.cards)})`);
          if (cd.newTrump) {
            lines.push(`  新主花色: ${cd.newTrump.isNoTrump ? '无主' : SUIT_NAMES[cd.newTrump.suit!]}`);
          }
          lines.push(`  获得底牌: ${formatCards(cd.receivedKitty)}`);
          lines.push(`  扣回底牌: ${formatCards(cd.discardedKitty)}`);
        } else {
          lines.push(`  ❌ ${SEAT_NAMES[cd.seat]} 炒底失败`);
        }
        lines.push("");
      }
    }

    // Final state after chaoDi
    if (ctx) {
      lines.push("最终状态:");
      lines.push(`  主花色: ${ctx.trumpSuit ? SUIT_NAMES[ctx.trumpSuit] : '无主'}`);
      lines.push(`  庄家: ${SEAT_NAMES[dealer]}`);
      if (this.kittyCards.length > 0) {
        lines.push(`  底牌: ${formatCards(this.kittyCards)}`);
      }
      lines.push("");
    }

    // Initial hands
    lines.push("--- 初始手牌 ---\n");
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    for (const seat of seats) {
      const hand = this.initialHands.get(seat) || [];
      const isDealer = seat === dealer;
      lines.push(`${SEAT_NAMES[seat]} (${hand.length}张)${isDealer ? ' 【庄家】' : ''}:`);
      if (ctx && hand.length > 0) {
        lines.push(`  ${displayHand(hand, ctx)}`);
      }
      lines.push("");
    }

    // Play phase - only if tricks have been recorded
    if (this.tricks.length > 0) {
      lines.push("--- 出牌阶段 ---\n");
      for (const trick of this.tricks) {
        lines.push(`\n第 ${trick.round} 轮`);
        lines.push("-".repeat(40));
        
        const playOrder: Seat[] = [];
        let current = trick.leader;
        for (let i = 0; i < 4; i++) {
          playOrder.push(current);
          current = ['east', 'north', 'west', 'south'][(['east', 'north', 'west', 'south'].indexOf(current) + 1) % 4] as Seat;
        }
        lines.push(`出牌顺序: ${playOrder.map(s => SEAT_NAMES[s]).join(' -> ')}\n`);

        if (trick.throwFailure) {
          lines.push(`⚠️  ${SEAT_NAMES[trick.throwFailure.seat]} 试图甩牌: ${formatCards(trick.throwFailure.attemptedCards)}`);
          lines.push(`   甩牌失败: ${trick.throwFailure.reason || '结构被压制'}`);
          lines.push(`   按规则改出: ${formatCards(trick.throwFailure.fallbackCards)}\n`);
        }

        for (const p of trick.plays) {
          const label = p.seat === trick.leader ? `${SEAT_NAMES[p.seat]} (首家)` : SEAT_NAMES[p.seat];
          lines.push(`${label}: ${formatCards(p.cards)}`);
        }

        lines.push(`\n🏆 ${SEAT_NAMES[trick.winner]} 赢得此轮！获得 ${trick.points} 分`);

        // Cumulative scores (running total)
        if (ctx) {
          const partner = getPartner(dealer);
          const runningScores = new Map<Seat, number>();
          for (const s of seats) runningScores.set(s, 0);
          
          // Calculate running scores up to this trick
          for (const t of this.tricks) {
            if (t.round > trick.round) break;
            runningScores.set(t.winner, (runningScores.get(t.winner) || 0) + t.points);
          }
          
          const dealerTeamScore = (runningScores.get(dealer) || 0) + (runningScores.get(partner) || 0);
          const defenderScore = seats
            .filter(s => s !== dealer && s !== partner)
            .reduce((sum, s) => sum + (runningScores.get(s) || 0), 0);
          lines.push(`\n累计得分:`);
          lines.push(`  庄家方 (${SEAT_NAMES[dealer]} + ${SEAT_NAMES[partner]}): ${dealerTeamScore} 分`);
          lines.push(`  防家方: ${defenderScore} 分`);
        }

        // Remaining hands (simplified - not showing full hands for each trick)
        lines.push(`\n下一轮首家: ${SEAT_NAMES[trick.winner]}`);
      }
    }

    // Settlement - only if game has completed
    if (this.gameResult) {
      lines.push(`\n${"=".repeat(80)}`);
      lines.push("--- 结算 ---\n");

      for (const seat of seats) {
        const score = this.finalScores.get(seat) || 0;
        const isDealer = seat === dealer;
        lines.push(`${SEAT_NAMES[seat]}${isDealer ? ' 【庄家】' : ''}: ${score} 分`);
      }

      const partner = getPartner(dealer);
      
      // 抠底信息（始终显示）
      lines.push(`\n🧮 抠底计算:`);
      lines.push(`   底牌分数: ${this.gameResult.kittyBaseScore} 分`);
      if (this.gameResult.isKittyTaken) {
        lines.push(`   是否抠底: ✅ 是（防家赢得最后一轮）`);
        lines.push(`   抠底倍数: ×${this.gameResult.kittyMultiplier}`);
        lines.push(`   抠底得分: ${this.gameResult.kittyBaseScore} × ${this.gameResult.kittyMultiplier} = ${this.gameResult.kittyScore} 分`);
      } else {
        lines.push(`   是否抠底: ❌ 否（庄家赢得最后一轮）`);
        lines.push(`   抠底得分: 0 分`);
      }
      
      lines.push(`\n最终得分:`);
      lines.push(`  庄家方 (${SEAT_NAMES[dealer]} + ${SEAT_NAMES[partner]}): ${this.gameResult.dealerTeamScore} 分`);
      lines.push(`  防家方: ${this.gameResult.defenderTeamScore} 分 + 抠底 ${this.gameResult.kittyScore} 分 = ${this.gameResult.totalScore} 分`);

      if (this.gameResult.winner === 'dealer') {
        lines.push(`\n🎉 庄家方获胜！`);
      } else {
        lines.push(`\n🎉 防家方获胜！（换庄到 ${SEAT_NAMES[this.gameResult.nextDealer]}）`);
      }

      lines.push(`\n下一局庄家: ${SEAT_NAMES[this.gameResult.nextDealer]}`);
      lines.push(`下一局级别: 东西=${teamLevels.eastWest}, 南北=${teamLevels.northSouth}`);
    }

    return lines.join('\n');
  }

  // Save the log to a file (writes everything at once)
  saveLog(dealer: Seat, teamLevels: { eastWest: Rank; northSouth: Rank }, ctx: GameContext | null): string {
    // Create output directory if needed
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Generate filename with date-time and session ID
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const filename = `game_${dateStr}_${this.sessionId}.md`;
    const filepath = path.join(this.outputDir, filename);
    const content = this.generateLogContent(dealer, teamLevels, ctx);

    fs.writeFileSync(filepath, content, 'utf-8');
    return filepath;
  }

  // NEW: Append current content to file incrementally
  flushToFile(ctx: GameContext | null, currentDealer?: Seat, currentTeamLevels?: { eastWest: Rank; northSouth: Rank }): void {
    // Use captured game start state if available, otherwise fall back to current state
    const dealer = this.gameStartDealer ?? currentDealer ?? null;
    const teamLevels = this.gameStartTeamLevels ?? currentTeamLevels ?? null;
    
    if (!dealer || !teamLevels) {
      console.error('GameLogger: game start state not set and no fallback provided, cannot flush');
      return;
    }

    // Create output directory if needed
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Generate filepath if not already set
    if (!this.filePath) {
      const now = new Date();
      const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `game_${dateStr}_${this.sessionId}.md`;
      this.filePath = path.join(this.outputDir, filename);
    }

    // Generate full content and write
    const content = this.generateLogContent(dealer, teamLevels, ctx);
    fs.writeFileSync(this.filePath, content, 'utf-8');
  }

  exportState(): GameLoggerState {
    return {
      gameNumber: this.gameNumber,
      gameStartDealer: this.gameStartDealer,
      gameStartTeamLevels: this.gameStartTeamLevels,
      dealingRounds: this.dealingRounds.map((round) => ({
        round: round.round,
        cardsBySeat: serializeCardMap(round.cardsBySeat),
        declarations: round.declarations.map((decl) => ({
          seat: decl.seat,
          cards: cloneCards(decl.cards),
        })),
      })),
      kittyCards: cloneCards(this.kittyCards),
      originalKittyCards: cloneCards(this.originalKittyCards),
      trumpInfo: this.trumpInfo
        ? {
            declarer: this.trumpInfo.declarer,
            suit: this.trumpInfo.suit,
            cards: cloneCards(this.trumpInfo.cards),
            isNoTrump: this.trumpInfo.isNoTrump,
          }
        : null,
      dealerKitty: this.dealerKitty,
      chaoDiRounds: this.chaoDiRounds.map((cd) => ({
        seat: cd.seat,
        cards: cloneCards(cd.cards),
        success: cd.success,
        newTrump: cd.newTrump ? { ...cd.newTrump } : null,
        receivedKitty: cloneCards(cd.receivedKitty),
        discardedKitty: cloneCards(cd.discardedKitty),
      })),
      initialHands: serializeHands(this.initialHands),
      tricks: this.tricks.map((trick) => ({
        round: trick.round,
        leader: trick.leader,
        plays: trick.plays.map((p) => ({ seat: p.seat, cards: cloneCards(p.cards) })),
        winner: trick.winner,
        points: trick.points,
        resolvedStructure: trick.resolvedStructure,
        throwFailure: trick.throwFailure
          ? {
              seat: trick.throwFailure.seat,
              attemptedCards: cloneCards(trick.throwFailure.attemptedCards),
              reason: trick.throwFailure.reason,
              fallbackCards: cloneCards(trick.throwFailure.fallbackCards),
            }
          : undefined,
      })),
      finalScores: serializeScoreMap(this.finalScores),
      gameResult: this.gameResult ? { ...this.gameResult } : null,
    };
  }

  restoreState(state: GameLoggerState) {
    this.gameNumber = state.gameNumber;
    this.gameStartDealer = state.gameStartDealer || null;
    this.gameStartTeamLevels = state.gameStartTeamLevels || null;
    this.dealingRounds = state.dealingRounds.map((round) => ({
      round: round.round,
      cardsBySeat: deserializeCardMap(round.cardsBySeat),
      declarations: round.declarations.map((decl) => ({
        seat: decl.seat,
        cards: cloneCards(decl.cards),
      })),
    }));
    this.kittyCards = cloneCards(state.kittyCards);
    this.originalKittyCards = cloneCards(state.originalKittyCards);
    this.trumpInfo = state.trumpInfo
      ? {
          declarer: state.trumpInfo.declarer,
          suit: state.trumpInfo.suit,
          cards: cloneCards(state.trumpInfo.cards),
          isNoTrump: state.trumpInfo.isNoTrump,
        }
      : null;
    this.dealerKitty = state.dealerKitty;
    this.chaoDiRounds = state.chaoDiRounds.map((cd) => ({
      seat: cd.seat,
      cards: cloneCards(cd.cards),
      success: cd.success,
      newTrump: cd.newTrump ? { ...cd.newTrump } : null,
      receivedKitty: cloneCards(cd.receivedKitty),
      discardedKitty: cloneCards(cd.discardedKitty),
    }));
    this.initialHands = deserializeHands(state.initialHands);
    this.tricks = state.tricks.map((trick) => ({
      round: trick.round,
      leader: trick.leader,
      plays: trick.plays.map((p) => ({ seat: p.seat, cards: cloneCards(p.cards) })),
      winner: trick.winner,
      points: trick.points,
      resolvedStructure: trick.resolvedStructure,
      throwFailure: trick.throwFailure
        ? {
            seat: trick.throwFailure.seat,
            attemptedCards: cloneCards(trick.throwFailure.attemptedCards),
            reason: trick.throwFailure.reason,
            fallbackCards: cloneCards(trick.throwFailure.fallbackCards),
          }
        : undefined,
    }));
    this.finalScores = deserializeScoreMap(state.finalScores);
    this.gameResult = state.gameResult ? { ...state.gameResult } : null;
  }
}

// ============================================================================
// Game Logger Manager - tracks multiple games
// ============================================================================

export class GameLoggerManager {
  private outputDir: string;
  private gameCount: number = 0;
  private currentLogger: GameLogger | null = null;

  constructor(outputDir: string = "game-logs-web") {
    this.outputDir = outputDir;
  }

  // Start a new game log
  startNewGame(sessionId?: string): GameLogger {
    this.gameCount++;
    this.currentLogger = new GameLogger(this.gameCount, this.outputDir, sessionId);
    return this.currentLogger;
  }

  // Get current logger
  getCurrentLogger(): GameLogger | null {
    return this.currentLogger;
  }

  // Get game count
  getGameCount(): number {
    return this.gameCount;
  }
}

// Global logger manager instance
let globalLoggerManager: GameLoggerManager | null = null;

export function getLoggerManager(outputDir?: string): GameLoggerManager {
  if (!globalLoggerManager) {
    globalLoggerManager = new GameLoggerManager(outputDir || "game-logs-web");
  }
  return globalLoggerManager;
}

function cloneCards(cards: Card[]): Card[] {
  return cards.map(c => ({ ...c }));
}

function serializeCardMap(map: Map<Seat, Card>): Record<Seat, Card> {
  const out: Record<string, Card> = {};
  for (const [seat, card] of map) {
    out[seat] = card;
  }
  return out as Record<Seat, Card>;
}

function deserializeCardMap(obj: Record<Seat, Card>): Map<Seat, Card> {
  const map = new Map<Seat, Card>();
  for (const seat of Object.keys(obj) as Seat[]) {
    map.set(seat, obj[seat]);
  }
  return map;
}

function serializeHands(hands: Map<Seat, Card[]>): Record<Seat, Card[]> {
  const out: Record<string, Card[]> = {};
  for (const [seat, cards] of hands) {
    out[seat] = cloneCards(cards);
  }
  return out as Record<Seat, Card[]>;
}

function deserializeHands(obj: Record<Seat, Card[]>): Map<Seat, Card[]> {
  const map = new Map<Seat, Card[]>();
  for (const seat of Object.keys(obj) as Seat[]) {
    map.set(seat, cloneCards(obj[seat]));
  }
  return map;
}

function serializeScoreMap(map: Map<Seat, number>): Record<Seat, number> {
  const out: Record<string, number> = {};
  for (const [seat, score] of map) {
    out[seat] = score;
  }
  return out as Record<Seat, number>;
}

function deserializeScoreMap(obj: Record<Seat, number>): Map<Seat, number> {
  const map = new Map<Seat, number>();
  for (const seat of Object.keys(obj) as Seat[]) {
    map.set(seat, obj[seat]);
  }
  return map;
}

export interface GameLoggerState {
  gameNumber: number;
  gameStartDealer: Seat | null;
  gameStartTeamLevels: { eastWest: Rank; northSouth: Rank } | null;
  dealingRounds: Array<{
    round: number;
    cardsBySeat: Record<Seat, Card>;
    declarations: Array<{ seat: Seat; cards: Card[] }>;
  }>;
  kittyCards: Card[];
  originalKittyCards: Card[];
  trumpInfo: {
    declarer: Seat;
    suit: Suit | null;
    cards: Card[];
    isNoTrump: boolean;
  } | null;
  dealerKitty: {
    seat: Seat;
    received: Card[];
    discarded: Card[];
  } | null;
  chaoDiRounds: Array<{
    seat: Seat;
    cards: Card[];
    success: boolean;
    newTrump: { suit: Suit | null; isNoTrump: boolean } | null;
    receivedKitty: Card[];
    discardedKitty: Card[];
  }>;
  initialHands: Record<Seat, Card[]>;
  tricks: Array<{
    round: number;
    leader: Seat;
    plays: Array<{ seat: Seat; cards: Card[] }>;
    winner: Seat;
    points: number;
    resolvedStructure?: any[];
    throwFailure?: {
      seat: Seat;
      attemptedCards: Card[];
      reason?: string;
      fallbackCards: Card[];
    };
  }>;
  finalScores: Record<Seat, number>;
  gameResult: {
    dealerTeamScore: number;
    defenderTeamScore: number;
    kittyBaseScore: number;
    kittyMultiplier: number;
    kittyScore: number;
    isKittyTaken: boolean;
    totalScore: number;
    winner: 'dealer' | 'defender';
    nextDealer: Seat;
    nextLevel: Rank;
  } | null;
}
