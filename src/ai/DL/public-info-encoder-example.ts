/**
 * 公共信息编码器使用示例
 * 
 * 展示如何在真实对局中使用编码器
 */

import { PublicInfoEncoder, type PublicInfoTensor } from './public-info-encoder';
import type { Card, GameContext, Seat } from '../../core/types';

// 创建一张牌
function card(id: number, suit: string, rank: string): Card {
  return { id, suit: suit as any, rank: rank as any };
}

// 创建王牌
function joker(id: number, type: 'big' | 'small'): Card {
  return { id, joker: type };
}

// 打印张量信息
function printTensor(tensor: PublicInfoTensor): void {
  console.log('\n=== 公共信息张量 ===');
  console.log(`轮次: ${tensor.roundNumber}`);
  console.log(`攻方得分: ${tensor.attackScore}`);
  console.log(`剩余牌数: ${tensor.remainingCounts.map(v => Math.round(v * 39)).join(', ')}`);
  console.log(`已出分数牌: 5×${tensor.scoreCardsPlayed[0]}, 10×${tensor.scoreCardsPlayed[1]}, K×${tensor.scoreCardsPlayed[2]}`);
  
  console.log('\n已出牌矩阵（主牌行）:');
  console.log(tensor.playedCardsMatrix[0].map(v => v.toString().padStart(2)).join(' '));
  
  console.log('\nVoid矩阵:');
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  tensor.voidMatrix.forEach((row, i) => {
    console.log(`  ${seats[i]}: ${row.map(v => v ? '✓' : '·').join(' ')}`);
  });
}

// 示例：模拟一局游戏
export function exampleGame(): void {
  console.log('=== 模拟对局 ===\n');
  
  // 游戏上下文：打2，红桃主
  const ctx: GameContext = {
    level: '2',
    trumpSuit: 'heart'
  };
  
  const encoder = new PublicInfoEncoder(ctx, 'east');
  
  console.log('初始状态:');
  printTensor(encoder.encode());
  
  // 第1轮：东家领出黑桃A
  console.log('\n--- 第1轮 ---');
  console.log('东家领出黑桃A');
  encoder.processPlay('east', [card(0, 'spade', 'A')]);
  
  // 北家杀牌（黑桃void）
  console.log('北家杀牌（红桃K）');
  encoder.processPlay('north', [card(1, 'heart', 'K')], true);
  
  // 西家跟黑桃
  console.log('西家跟黑桃K');
  encoder.processPlay('west', [card(2, 'spade', 'K')]);
  
  // 南家跟黑桃Q
  console.log('南家跟黑桃Q');
  encoder.processPlay('south', [card(3, 'spade', 'Q')]);
  
  // 结算
  encoder.processTrickEnd('north', 0);
  console.log('北家获胜，本轮无分');
  
  printTensor(encoder.encode());
  
  // 第2轮：北家领出带分的牌
  console.log('\n--- 第2轮 ---');
  console.log('北家领出黑桃5（带分）');
  encoder.processPlay('north', [card(4, 'spade', '5')]);
  
  console.log('西家跟黑桃10（带分）');
  encoder.processPlay('west', [card(5, 'spade', '10')]);
  
  console.log('南家跟黑桃J');
  encoder.processPlay('south', [card(6, 'spade', 'J')]);
  
  console.log('东家杀牌（大王）');
  encoder.processPlay('east', [joker(100, 'big')], true);
  
  encoder.processTrickEnd('east', 15);
  console.log('东家获胜，得15分（攻方得分）');
  
  printTensor(encoder.encode());
  
  // 检查void推断
  const state = encoder.getState();
  console.log('\n=== 推断事实 ===');
  console.log('北家黑桃void:', state.facts.voids.get('north')?.has('spade') ? '是' : '否');
  console.log('已出黑桃A:', state.facts.exhaustedRanks.get('spade')?.has('A') ? '是' : '否');
  console.log('已出大王:', state.facts.exhaustedRanks.get('trump')?.has('joker') ? '是' : '否');
  
  // 打印历史事件
  console.log('\n=== 历史事件 ===');
  state.history.forEach((event, i) => {
    const cards = event.cards?.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`).join(',') || '-';
    console.log(`${i + 1}. ${event.seat} ${event.type} [${cards}]${event.score ? ` 得${event.score}分` : ''}`);
  });
}

// 运行示例
if (import.meta.main) {
  exampleGame();
}