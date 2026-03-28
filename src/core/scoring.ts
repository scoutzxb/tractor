// M6: 计分与升级

import type { Card, GameContext, Rank, Seat, Component, ParseResult } from './types';
import { parseCards } from './parser';

/**
 * 得分牌分值
 */
const POINT_VALUES: Record<string, number> = {
  '5': 5,
  '10': 10,
  'K': 10
};

/**
 * 回合结果
 */
export interface RoundResult {
  attackScore: number;      // 攻方得分
  kittyScore: number;       // 底牌得分（含抠底倍数）
  totalScore: number;       // 总分
  defenseUpgrade: number;   // 守方升几级
  attackUpgrade: number;    // 攻方升几级
  nextDealer: Seat;         // 下一局庄家
  jDemotion: boolean;       // 是否触发J降级
}

/**
 * 计算一组牌的分数
 */
export function getPointCards(cards: Card[]): number {
  let score = 0;
  
  for (const card of cards) {
    if (card.rank && POINT_VALUES[card.rank]) {
      score += POINT_VALUES[card.rank];
    }
  }
  
  return score;
}

/**
 * 计算抠底倍数
 */
export function getKittyMultiplier(winningPlay: ParseResult): number {
  if (winningPlay.length === 0) return 1;
  
  // 找最高阶组件
  const maxComponent = findMaxComponent(winningPlay);
  
  return getComponentMultiplier(maxComponent);
}

/**
 * 找最高阶组件
 */
function findMaxComponent(components: ParseResult): Component {
  const priority = ['super_tractor', 'triple', 'tractor', 'pair', 'single'];
  
  for (const type of priority) {
    const comp = components.find(c => c.type === type);
    if (comp) return comp;
  }
  
  return components[0];
}

/**
 * 获取组件的抠底倍数
 */
function getComponentMultiplier(comp: Component): number {
  switch (comp.type) {
    case 'single':
      return 2;
    case 'pair':
      return 4;
    case 'tractor':
      // 拖拉机：2^(n+1)，n=连数
      const tractorLen = comp.length || 2;
      return Math.pow(2, tractorLen + 1);
    case 'triple':
      return 6;
    case 'super_tractor':
      // 超级拖拉机：6×3^(n-1)，n=连数
      const stLen = comp.length || 2;
      return 6 * Math.pow(3, stLen - 1);
    default:
      return 2;
  }
}

function containsJ(cards: Card[]): boolean {
  return cards.some(card => card.rank === 'J');
}

function getCardWeight(card: Card, ctx: GameContext): number {
  if (card.joker === 'big') return 1000;
  if (card.joker === 'small') return 999;
  if (card.rank === ctx.level) {
    if (ctx.trumpSuit !== null && card.suit === ctx.trumpSuit) return 998;
    return 997;
  }
  const v: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return v[card.rank || '2'] || 0;
}

function componentStrength(comp: Component, ctx: GameContext): number {
  const top = comp.cards.length > 0 ? Math.max(...comp.cards.map(c => getCardWeight(c, ctx))) : 0;
  if (comp.type === 'super_tractor') {
    const len = comp.length || Math.floor(comp.cards.length / 3) || 1;
    return len * 10000 + top;
  }
  if (comp.type === 'tractor') {
    const len = comp.length || Math.floor(comp.cards.length / 2) || 1;
    return len * 10000 + top;
  }
  if (comp.type === 'triple') return 30000 + top;
  if (comp.type === 'pair') return 20000 + top;
  return 10000 + top;
}

function getTypeMaxComponents(components: ParseResult, ctx: GameContext): Component[] {
  const out: Component[] = [];
  const typeOrder: Array<Component['type']> = ['super_tractor', 'triple', 'tractor', 'pair', 'single'];

  for (const t of typeOrder) {
    const arr = components.filter(c => c.type === t);
    if (arr.length === 0) continue;

    let maxScore = -Infinity;
    for (const c of arr) {
      const s = componentStrength(c, ctx);
      if (s > maxScore) maxScore = s;
    }

    for (const c of arr) {
      if (componentStrength(c, ctx) === maxScore) out.push(c);
    }
  }

  return out;
}

/**
 * 判断是否触发J降级
 * 条件：打J时，闲家用J抠底，且J在“最大组件集合”中
 * - 甩牌抠底：每种牌型都可能有最大组件，任一包含J即触发
 * - 甩牌杀牌抠底：可传入 resolvedStructure（按对应甩牌结构解析后的结果）
 */
export function checkJDemotion(
  winningPlay: ParseResult,
  ctx: GameContext,
  resolvedStructure?: ParseResult
): boolean {
  if (ctx.level !== 'J') return false;

  const source = resolvedStructure && resolvedStructure.length > 0 ? resolvedStructure : winningPlay;
  const maxComponents = getTypeMaxComponents(source, ctx);

  return maxComponents.some(comp => containsJ(comp.cards));
}

/**
 * 计算一局结果
 */
export function calculateResult(
  attackScore: number,
  kitty: Card[],
  lastRoundWinner: 'attack' | 'defense',
  lastRoundPlay: Card[],
  ctx: GameContext & { dealer: Seat; teamLevels: { eastWest: Rank; northSouth: Rank } },
  resolvedLastRoundStructure?: ParseResult
): RoundResult {
  const kittyPoints = getPointCards(kitty);
  
  let kittyMultiplier = 1;
  let jDemotion = false;
  let kittyScore = 0;
  
  if (lastRoundWinner === 'attack') {
    const lastPlayStructure = resolvedLastRoundStructure && resolvedLastRoundStructure.length > 0
      ? resolvedLastRoundStructure
      : parseCards(lastRoundPlay, ctx);
    kittyMultiplier = getKittyMultiplier(lastPlayStructure);
    jDemotion = checkJDemotion(lastPlayStructure, ctx, resolvedLastRoundStructure);
    kittyScore = kittyPoints * kittyMultiplier;
  }
  
  const totalScore = attackScore + kittyScore;
  
  const { defenseUpgrade, attackUpgrade } = calculateUpgrade(totalScore, jDemotion);
  const nextDealer = calculateNextDealer(ctx.dealer, defenseUpgrade > 0, ctx.teamLevels);
  
  return {
    attackScore,
    kittyScore,
    totalScore,
    defenseUpgrade,
    attackUpgrade,
    nextDealer,
    jDemotion
  };
}

/**
 * 计算升级级数
 */
function calculateUpgrade(totalScore: number, jDemotion: boolean): { defenseUpgrade: number; attackUpgrade: number } {
  if (totalScore === 0) {
    return { defenseUpgrade: 3, attackUpgrade: 0 };
  } else if (totalScore <= 55) {
    return { defenseUpgrade: 2, attackUpgrade: 0 };
  } else if (totalScore <= 115) {
    return { defenseUpgrade: 1, attackUpgrade: 0 };
  } else if (totalScore <= 175) {
    return { defenseUpgrade: 0, attackUpgrade: 0 }; // 换庄不升级
  } else if (totalScore <= 235) {
    return { defenseUpgrade: 0, attackUpgrade: 1 };
  } else if (totalScore <= 295) {
    return { defenseUpgrade: 0, attackUpgrade: 2 };
  } else {
    return { defenseUpgrade: 0, attackUpgrade: 3 };
  }
}

/**
 * 计算下一局庄家
 */
function calculateNextDealer(
  currentDealer: Seat,
  defenseWins: boolean,
  teamLevels: { eastWest: Rank; northSouth: Rank }
): Seat {
  // 座位顺序（逆时针）：东 → 北 → 西 → 南
  const seatOrder: Seat[] = ['east', 'north', 'west', 'south'];
  
  // 东西组：东、西
  // 南北组：南、北
  const dealerIdx = seatOrder.indexOf(currentDealer);
  
  if (defenseWins) {
    // 守方胜 → 庄家交给同组另一人
    // 东西组：东 ↔ 西
    // 南北组：南 ↔ 北
    const sameGroupOffset = 2; // 同组间隔2个座位
    const nextIdx = (dealerIdx + sameGroupOffset) % 4;
    return seatOrder[nextIdx];
  } else {
    // 攻方胜 → 庄家交给另一组（逆时针下一座位）
    const nextIdx = (dealerIdx + 1) % 4;
    return seatOrder[nextIdx];
  }
}

/**
 * 应用升级（考虑必打级别）
 */
export function applyUpgrade(
  currentLevel: Rank,
  upgrade: number,
  mandatoryLevels: Rank[] = ['2', '5', '10', 'J', 'K'],
  exemptLevels: Rank[] = [] // 降级豁免的必打级别
): Rank {
  if (upgrade === 0) return currentLevel;
  
  const allLevels: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'AA'];
  const currentIdx = allLevels.indexOf(currentLevel);
  
  // If already at AA, stay at AA
  if (currentIdx === allLevels.length - 1) return currentLevel;
  
  let newIdx = currentIdx + upgrade;
  
  // 检查必打级别
  const effectiveMandatory = mandatoryLevels.filter(l => !exemptLevels.includes(l));
  
  // 如果跳过了必打级别，停在必打级别
  for (let i = currentIdx + 1; i <= newIdx && i < allLevels.length; i++) {
    if (effectiveMandatory.includes(allLevels[i])) {
      newIdx = i;
      break;
    }
  }
  
  // Cap at AA (victory)
  if (newIdx >= allLevels.length) {
    newIdx = allLevels.length - 1;
  }
  
  return allLevels[newIdx];
}

/**
 * 检查是否获胜（升过A）
 */
export function checkVictory(level: Rank): boolean {
  return level === 'AA';
}

/**
 * 判断庄家所在队伍
 */
export function getDealerTeam(dealer: Seat): 'eastWest' | 'northSouth' {
  return (dealer === 'east' || dealer === 'west') ? 'eastWest' : 'northSouth';
}

/**
 * 判断两个座位是否同队
 */
export function isTeammate(seat1: Seat, seat2: Seat): boolean {
  const eastWest = ['east', 'west'];
  const northSouth = ['north', 'south'];
  
  return (eastWest.includes(seat1) && eastWest.includes(seat2)) ||
         (northSouth.includes(seat1) && northSouth.includes(seat2));
}

/**
 * 获取逆时针下一座位
 */
export function getNextSeat(seat: Seat): Seat {
  const order: Seat[] = ['east', 'north', 'west', 'south'];
  const idx = order.indexOf(seat);
  return order[(idx + 1) % 4];
}

/**
 * 获取对家座位
 */
export function getPartner(seat: Seat): Seat {
  const partners: Record<Seat, Seat> = {
    'east': 'west',
    'west': 'east',
    'north': 'south',
    'south': 'north'
  };
  return partners[seat];
}

export interface KittyBonusResult {
  applied: boolean;
  baseScore: number;
  multiplier: number;
  addedScore: number;
}

export function calculateDefenderKittyBonus(
  kitty: Card[],
  lastRoundWinnerSeat: Seat | null,
  dealer: Seat,
  dealerPartner: Seat,
  lastRoundWinningCards: Card[],
  ctx: GameContext
): KittyBonusResult {
  const baseScore = getPointCards(kitty);
  if (!lastRoundWinnerSeat) {
    return { applied: false, baseScore, multiplier: 1, addedScore: 0 };
  }

  const defenderWonLast = lastRoundWinnerSeat !== dealer && lastRoundWinnerSeat !== dealerPartner;
  if (!defenderWonLast) {
    return { applied: false, baseScore, multiplier: 1, addedScore: 0 };
  }

  const structure = parseCards(lastRoundWinningCards, ctx);
  const multiplier = getKittyMultiplier(structure);
  return {
    applied: true,
    baseScore,
    multiplier,
    addedScore: baseScore * multiplier
  };
}

export interface TeamExemptions {
  eastWest: Rank[];
  northSouth: Rank[];
}

export interface PostRoundState {
  nextDealer: Seat;
  nextTeamLevels: { eastWest: Rank; northSouth: Rank };
  nextExemptions: TeamExemptions;
  jDemotionApplied: boolean;
}

export function resolvePostRoundState(
  result: RoundResult,
  dealer: Seat,
  teamLevels: { eastWest: Rank; northSouth: Rank },
  currentExemptions: TeamExemptions = { eastWest: [], northSouth: [] },
  mandatoryLevels: Rank[] = ['2', '5', '10', 'J', 'K']
): PostRoundState {
  const nextTeamLevels = { ...teamLevels };
  const nextExemptions: TeamExemptions = {
    eastWest: [...currentExemptions.eastWest],
    northSouth: [...currentExemptions.northSouth]
  };
  const dealerTeam = getDealerTeam(dealer);
  const attackTeam = dealerTeam === 'eastWest' ? 'northSouth' : 'eastWest';

  let jDemotionApplied = false;
  if (result.jDemotion && result.totalScore >= 120) {
    nextTeamLevels[dealerTeam] = '2';
    jDemotionApplied = true;

    // 记录“J抠底降回2”的豁免记忆：后续可跳过 2/5/10
    const baseExempt: Rank[] = ['2', '5', '10'];
    const merged = new Set<Rank>([...nextExemptions[dealerTeam], ...baseExempt]);
    nextExemptions[dealerTeam] = Array.from(merged);
  }

  // Dealer team can always upgrade when they win (they're the dealer)
  if (result.defenseUpgrade > 0) {
    nextTeamLevels[dealerTeam] = applyUpgrade(
      nextTeamLevels[dealerTeam],
      result.defenseUpgrade,
      mandatoryLevels,
      nextExemptions[dealerTeam]
    );
  }

  // Attack team (defenders) cannot advance past mandatory levels
  // They must become dealer first to pass mandatory levels
  if (result.attackUpgrade > 0) {
    const attackTeamLevel = nextTeamLevels[attackTeam];
    const effectiveMandatory = mandatoryLevels.filter(l => !nextExemptions[attackTeam].includes(l));
    
    // If attack team is at a mandatory level (not exempted), they cannot upgrade
    if (effectiveMandatory.includes(attackTeamLevel)) {
      // Attack team stays at current level - they need to become dealer first
      // Don't apply any upgrade
    } else {
      nextTeamLevels[attackTeam] = applyUpgrade(
        nextTeamLevels[attackTeam],
        result.attackUpgrade,
        mandatoryLevels,
        nextExemptions[attackTeam]
      );
    }
  }

  return {
    nextDealer: result.nextDealer,
    nextTeamLevels,
    nextExemptions,
    jDemotionApplied
  };
}
