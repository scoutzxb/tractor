// M8 测试：游戏主循环

import { describe, test, expect } from 'bun:test';
import { createGameEngine } from '../src/engine/game-loop';
import { createAIPlayer } from '../src/engine/ai-player';
import type { Seat } from '../src/core/types';

describe('M8: 游戏主循环', () => {
  
  test('初始化游戏引擎', () => {
    const engine = createGameEngine('2', 'east');
    const state = engine.getState();
    
    expect(state.level).toBe('2');
    expect(state.dealer).toBe('east');
    expect(state.isOver).toBe(false);
    expect(state.hands.size).toBe(4);
  });
  
  test('注册AI玩家', () => {
    const engine = createGameEngine('2', 'east');
    
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    for (const seat of seats) {
      engine.registerPlayer(createAIPlayer(seat));
    }
    
    // 注册成功不抛错即为成功
    expect(true).toBe(true);
  });
  
  test('运行一局完整游戏', () => {
    const engine = createGameEngine('2', 'east');
    
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    for (const seat of seats) {
      engine.registerPlayer(createAIPlayer(seat));
    }
    
    const state = engine.runOneGame();
    
    // 验证游戏状态
    expect(state.isOver).toBeDefined();
    expect(state.roundNumber).toBe(39);
    
    // 验证手牌已清空
    state.hands.forEach(hand => {
      expect(hand.length).toBe(0);
    });
    
    // 验证有得分记录
    let totalScore = 0;
    state.scores.forEach(score => {
      totalScore += score;
    });
    expect(totalScore).toBeGreaterThan(0);
  });
  
  test('游戏日志记录', () => {
    const engine = createGameEngine('2', 'east');
    
    const seats: Seat[] = ['east', 'north', 'west', 'south'];
    for (const seat of seats) {
      engine.registerPlayer(createAIPlayer(seat));
    }
    
    engine.runOneGame();
    
    const logs = engine.getLogs();
    
    // 验证有日志记录
    expect(logs.length).toBeGreaterThan(0);
    
    // 验证关键事件
    const logTypes = new Set(logs.map(l => l.type));
    expect(logTypes.has('deal')).toBe(true);
    expect(logTypes.has('trump')).toBe(true);
    expect(logTypes.has('discard')).toBe(true);
    expect(logTypes.has('trick')).toBe(true);
    expect(logTypes.has('score')).toBe(true);
  });
  
  test('多局游戏稳定性', () => {
    // 运行10局游戏测试
    for (let i = 0; i < 10; i++) {
      const engine = createGameEngine('2', 'east');
      
      const seats: Seat[] = ['east', 'north', 'west', 'south'];
      for (const seat of seats) {
        engine.registerPlayer(createAIPlayer(seat));
      }
      
      const state = engine.runOneGame();
      
      // 每局都应该正常结束
      expect(state.roundNumber).toBe(39);
    }
  });
  
  test('不同初始级别', () => {
    const levels: Array<'2' | '3' | '5' | '10' | 'K'> = ['2', '3', '5', '10', 'K'];
    
    for (const level of levels) {
      const engine = createGameEngine(level, 'east');
      
      const seats: Seat[] = ['east', 'north', 'west', 'south'];
      for (const seat of seats) {
        engine.registerPlayer(createAIPlayer(seat));
      }
      
      const state = engine.runOneGame();
      
      expect(state.roundNumber).toBe(39);
    }
  });
  
  test('不同初始庄家', () => {
    const dealers: Seat[] = ['east', 'north', 'west', 'south'];
    
    for (const dealer of dealers) {
      const engine = createGameEngine('2', dealer);
      
      const state = engine.getState();
      expect(state.dealer).toBe(dealer);
      
      const seats: Seat[] = ['east', 'north', 'west', 'south'];
      for (const seat of seats) {
        engine.registerPlayer(createAIPlayer(seat));
      }
      
      const finalState = engine.runOneGame();
      expect(finalState.roundNumber).toBe(39);
    }
  });
});

console.log('✓ M8 测试完成');
