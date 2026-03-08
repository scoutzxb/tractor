# 拖拉机游戏开发总结 - 第一、二阶段

**日期**: 2026-03-02  
**状态**: 第二阶段基本完成，亮主和炒底功能已实现

---

## 📋 已完成的工作

### 第一阶段：核心模块 (M1-M7)

#### M1: 牌库与排序 ✅
- **文件**: `src/core/deck.ts`
- **功能**:
  - 生成162张牌（3副牌，含6张大小王）
  - 发牌：每人39张 + 6张底牌
  - 主牌序列：大王 > 小王 > 主花色级牌 > 其他花色级牌 > 主花色A-K
  - 副牌序列：A-K（跳过级牌）
  - 手牌排序：主牌 > 黑桃 > 红桃 > 梅花 > 方块

#### M2: 牌型解析 ✅
- **文件**: `src/core/parser.ts`
- **功能**:
  - 贪心算法识别牌型
  - 优先级：超级拖拉机 > 三张 > 拖拉机 > 对子 > 单牌
  - 正确处理主牌和副牌

#### M3: 甩牌校验 ✅
- **文件**: `src/core/lead-validator.ts`
- **功能**:
  - 校验甩牌合法性
  - 检查是否会被杀牌

#### M4: 跟牌引擎 ✅
- **文件**: `src/core/follow-validator.ts`
- **功能**:
  - 必须跟同门牌
  - 自动补选功能

#### M5: 杀牌校验 ✅
- **文件**: `src/core/kill-validator.ts`
- **功能**:
  - 主牌杀副牌规则
  - 杀牌结构匹配

#### M6: 计分与升级 ✅
- **文件**: `src/core/scoring.ts`
- **功能**:
  - 5、10、K计分
  - 底牌倍数计算
  - 升级规则

#### M7: 亮主状态机 ✅
- **文件**: `src/core/trump-state.ts`
- **功能**:
  - 亮主优先级系统
  - 炒底规则
  - 无主局翻底牌

### 第二阶段：游戏主循环 (M8)

#### M8: 游戏引擎 ✅
- **文件**: `src/engine/game-loop.ts`
- **功能**:
  - 完整游戏流程：发牌 → 亮主 → 炒底 → 扣底 → 出牌 → 结算
  - AI玩家支持
  - 日志系统

#### AI玩家 ✅
- **文件**: `src/engine/ai-player.ts`
- **功能**:
  - 智能牌型识别
  - 优先出高级牌型（超级拖拉机 > 三张 > 拖拉机 > 对子 > 单牌）
  - 策略：只用单张级牌亮主，保留更强牌型用于炒底

#### 智能扣底牌策略 ✅
- **文件**: `smart-discard-v2.ts`
- **功能**:
  - 绝对不扣：级牌、大王、小王
  - 优先不扣：主花色牌
  - 从非主花色单牌中选择最小的
  - 不破坏高级牌型

---

## 🐛 已修复的重大Bug

### 1. 手牌排序问题
**问题**: 手牌显示顺序错误，没有按主牌、副牌分类显示  
**修复**: 使用`sortHand()`函数，正确排序：
- 主牌在前，副牌在后
- 主牌按：大王 > 小王 > 主花色级牌 > 其他级牌 > 主花色A-2
- 副牌按：黑桃 > 红桃 > 梅花 > 方块
- 同花色按A到2降序

### 2. 级牌被错误扣入底牌
**问题**: AI扣底牌时把级牌（所有花色的当前级别牌）扣入底牌  
**修复**: 在`smartDiscardKitty()`中添加级牌检查：
```typescript
if (card.rank === ctx.level) continue;  // 跳过级牌
```

### 3. 亮主逻辑问题
**问题**: AI用所有牌型亮主，没有保留实力用于炒底  
**修复**: AI策略改为只用单张级牌亮主，保留对子、三张等更强牌型

### 4. 炒底顺序错误
**问题**: 炒底顺序错误，每轮都从固定位置开始  
**修复**: 
- 第1轮从庄家开始，逆时针
- 第2轮开始从上一轮炒底成功者开始
- 庄家也能参与炒底（除了最后亮主的人）

### 5. 炒底牌型限制
**问题**: 炒底时只用单张牌，没用对子、三张等  
**修复**: `chooseTrump()`方法分两种模式：
- 初始亮主：只用单张级牌
- 炒底：使用所有牌型（三张大王 > 三张小王 > 三张级牌 > 一对大王 > 一对小王 > 一对级牌）

### 6. 无主局处理
**问题**: 无主局使用null导致显示问题  
**修复**: 正确处理`trumpSuit: null`的情况，显示为"无主"

### 7. 炒底后扣牌显示
**问题**: 炒底成功后没有显示扣回的底牌  
**修复**: 在日志中添加`kittyReturned`字段，显示扣回的6张牌

### 8. 底牌数量错误
**问题**: 扣底牌时传入了错误的count参数（39而不是6）  
**修复**: `smartDiscardKitty(hand, ctx, 6)` 正确传入6

### 9. 同花色炒底限制
**问题**: 无主局（suit为null）时，大王对小王的炒底被错误拦截  
**修复**: 只有当双方suit都不为null时才检查同花色限制：
```typescript
if (declaration.suit !== null && state.currentTrump?.suit !== null) {
  if (declaration.suit === state.currentTrump.suit) return false;
}
```

### 10. 花色优先级错误
**问题**: 相同优先级时，没有按花色优先级比较  
**修复**: 添加花色优先级：黑桃 > 红桃 > 梅花 > 方块

---

## 🎮 游戏规则总结

### 亮主规则
1. **优先级**（从高到低）：
   - 三张大王（优先级10，无主）
   - 三张小王（优先级9，无主）
   - 三张同花色级牌（优先级8）
   - 一对大王（优先级7，无主）
   - 一对小王（优先级6，无主）
   - 一对同花色级牌（优先级7）
   - 单张级牌（优先级7）

2. **花色优先级**：黑桃 > 红桃 > 梅花 > 方块

3. **同级别反主**：相同优先级时，可以反成不同花色

### 炒底规则
1. **参与条件**：
   - 非抢庄局
   - 有人亮主
   - 最后亮主者不能炒底
   - 当前持底牌者不能炒底

2. **炒底顺序**：
   - 第1轮：从庄家开始，逆时针
   - 第2轮起：从上一轮炒底成功者开始

3. **炒底要求**：
   - 必须更高优先级（或相同优先级+更高花色优先级）
   - 不能反成同一花色（双方suit都不为null时）

4. **炒底结果**：
   - 炒底者获得底牌（45张）
   - 炒底者扣回6张牌
   - 更新主花色

### 扣底牌策略
1. **绝对不扣**：级牌、大王、小王
2. **优先不扣**：主花色牌
3. **选择策略**：从非主花色单牌中选择最小的
4. **分散原则**：尽量分散在3-4个花色中
5. **不破坏牌型**：不拆对子、拖拉机、三张

---

## 📁 文件结构

```
tractor/
├── src/
│   ├── core/
│   │   ├── types.ts              # 类型定义
│   │   ├── deck.ts               # M1: 牌库与排序
│   │   ├── parser.ts             # M2: 牌型解析
│   │   ├── lead-validator.ts     # M3: 甩牌校验
│   │   ├── follow-validator.ts   # M4: 跟牌引擎
│   │   ├── kill-validator.ts     # M5: 杀牌校验
│   │   ├── scoring.ts            # M6: 计分与升级
│   │   └── trump-state.ts        # M7: 亮主状态机
│   └── engine/
│       ├── game-loop.ts          # M8: 游戏主循环
│       └── ai-player.ts          # AI玩家
├── tests/
│   ├── deck.test.ts              # M1测试
│   ├── parser.test.ts            # M2测试
│   ├── lead-validator.test.ts    # M3测试
│   ├── follow-validator.test.ts  # M4测试
│   ├── kill-validator.test.ts    # M5测试
│   ├── scoring.test.ts           # M6测试
│   ├── trump-state.test.ts       # M7测试
│   └── game-loop.test.ts         # M8测试
├── smart-discard-v2.ts           # 智能扣底牌策略
├── test-engine-real.ts           # 完整引擎测试
├── cli.ts                        # 命令行界面
└── README.md                     # 项目说明
```

---

## ✅ 测试状态

**总计**: 123个测试  
**通过**: 123个  
**失败**: 0个

**压力测试**:
- 100局游戏：✅ 平均3.5毫秒/局
- 1000局游戏：✅ 平均2.4毫秒/局

---

## 🔧 待完成的工作

### 第三阶段：用户界面
- [ ] 图形界面（React + Tailwind）
- [ ] 网络多人对战
- [ ] 实时游戏状态同步

### 第四阶段：优化
- [ ] AI策略优化（更智能的出牌策略）
- [ ] 性能优化
- [ ] 更多的测试用例

---

## 📝 关键代码片段

### 智能扣底牌策略
```typescript
export function smartDiscardKitty(
  hand: Card[],
  ctx: GameContext,
  count: number = 6
): Card[] {
  // 1. 解析牌型
  const components = parseCards(hand, ctx);
  
  // 2. 分类：级牌、王、主花色牌、非主牌
  const levelCards: Card[] = [];
  const jokers: Card[] = [];
  const trumpCards: Card[] = [];
  const nonTrumpCards: Card[] = [];
  
  for (const card of hand) {
    if (card.rank === ctx.level) {
      levelCards.push(card);
      continue;
    }
    if (card.joker) {
      jokers.push(card);
      continue;
    }
    if (ctx.trumpSuit && card.suit === ctx.trumpSuit) {
      trumpCards.push(card);
      continue;
    }
    nonTrumpCards.push(card);
  }
  
  // 3. 从非主牌单牌中选择最小的
  // ...
}
```

### 炒底逻辑
```typescript
chaoDiPhase(): void {
  const seats: Seat[] = ['east', 'north', 'west', 'south'];
  let currentStartIdx = seats.indexOf(this.state.dealer);
  
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < seats.length; i++) {
      const seatIdx = (currentStartIdx + i) % seats.length;
      const seat = seats[seatIdx];
      
      // 最后亮主者不能炒底
      if (seat === this.state.trumpState.currentTrump?.declarer) continue;
      
      const cards = player.chooseTrump(hand, level, state);
      
      if (canChaoDi(state, seat, cards, level)) {
        // 炒底成功
        state = chaoDi(state, seat, cards, level);
        
        // 炒底者获得底牌，扣回6张
        const toReturn = player.discardKitty([...hand, ...kitty], kitty, ctx);
        
        // 更新下一轮起始位置
        currentStartIdx = seatIdx;
        break;
      }
    }
  }
}
```

---

## 🎯 关键学习点

1. **牌型识别**：贪心算法，优先识别高级牌型
2. **主牌判断**：级牌、王、主花色牌都是主牌
3. **炒底规则**：顺序、优先级、花色优先级的正确实现
4. **级牌处理**：级牌不在副牌序列中，需要特殊处理
5. **无主局**：使用null表示，需要特殊处理各种判断

---

## 🚀 下一步计划

1. **优化AI策略**：让AI更智能地选择出牌
2. **完善测试**：添加更多边界情况的测试
3. **实现图形界面**：React + Tailwind CSS
4. **网络对战**：WebSocket实时通信

---

**文档创建时间**: 2026-03-02  
**最后更新**: 2026-03-02
