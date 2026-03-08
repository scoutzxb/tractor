# 游戏引擎需要添加炒底阶段

## 🚨 发现问题

`src/engine/game-loop.ts` 中**完全没有炒底逻辑**！

## 📍 需要修改的位置

### 1. 在 `trumpPhase()` 之后添加 `chaoDiPhase()`

**文件**: `src/engine/game-loop.ts`
**位置**: 第228行（trumpPhase之后）

```typescript
// 阶段2.5：炒底
chaoDiPhase(): void {
  // 抢庄局禁止炒底
  if (this.state.trumpState.isGrabMode) return;
  
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  const maxRounds = 3;
  let currentStartIdx = 0;
  
  for (let round = 0; round < maxRounds; round++) {
    let chaoDiHappened = false;
    
    // 从currentStartIdx开始，逆时针遍历所有玩家
    for (let i = 0; i < seats.length; i++) {
      const seatIdx = (currentStartIdx + i) % seats.length;
      const seat = seats[seatIdx];
      
      // 最后炒底的人不能再炒
      if (seat === this.state.trumpState.currentTrump?.declarer) continue;
      
      const player = this.players.get(seat);
      if (!player) continue;
      
      const hand = this.state.hands.get(seat) || [];
      const cards = player.chooseTrump(hand, this.state.level, this.state.trumpState);
      
      if (cards && cards.length > 0 && canChaoDi(this.state.trumpState, seat, cards, this.state.level)) {
        // 炒底成功
        this.state.trumpState = chaoDi(this.state.trumpState, seat, cards, this.state.level);
        chaoDiHappened = true;
        
        // 炒底者获得底牌
        const chaoDiHand = [...(this.state.hands.get(seat) || []), ...this.state.kitty];
        
        // 扣回6张牌
        const player = this.players.get(seat);
        const toReturn = player ? player.discardKitty(chaoDiHand, this.state.kitty, this.state.ctx!) : chaoDiHand.slice(0, 6);
        
        this.state.hands.set(seat, toReturn);
        this.state.kitty = chaoDiHand.filter(c => !toReturn.includes(c));
        
        // 更新下一轮起始位置
        currentStartIdx = seatIdx;
        
        this.log('chaoDi', `${seat} 炒底成功`, {
          cards: cards.map(c => c.joker ? c.joker : `${c.suit}${c.rank}`),
          newTrump: this.state.trumpState.currentTrump
        });
        
        break;
      }
    }
    
    if (!chaoDiHappened) break;
  }
  
  // 更新GameContext
  this.state.ctx = createGameContext(this.state.level, this.state.trumpState);
}
```

### 2. 修改 `runOneGame()`

**位置**: 第647行

```typescript
// 运行一局游戏
runOneGame(): GameState {
  this.dealCards();
  this.trumpPhase();
  this.chaoDiPhase();  // ← 添加炒底阶段
  this.discardPhase();
  this.playPhase();
  this.settlePhase();
  
  return this.state;
}
```

### 3. 添加导入

**位置**: 第12行

```typescript
import {
  createTrumpState,
  declare,
  canDeclare,
  canChaoDi,    // ← 添加
  chaoDi,        // ← 添加
  flipKitty,
  createGameContext,
  type TrumpState
} from '../core/trump-state';
```

## ✅ 测试文件已修复

`tractor/test-final.ts` 已经实现了正确的炒底逻辑，可以作为参考。

## 📊 炒底规则

1. **顺序**: 逆时针（east → north → west → south）
2. **第1轮**: 从庄家开始
3. **第2轮**: 从上一轮炒底成功者开始
4. **最后炒底者**: 不能在同一轮再次炒底
5. **炒底成功后**: 获得底牌，扣回6张，更新主花色

## 🔧 实现要点

- 炒底成功者获得底牌并扣回6张
- 手牌始终保持在39张
- 底牌会随炒底流转
- 主花色会随炒底改变
- 每轮从炒底成功者开始，而不是回到east

游戏引擎需要实现这些规则！
