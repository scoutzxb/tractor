# 手牌显示功能更新说明

## ✅ 功能已完成

手牌现在按**主牌、副牌分类**显示，并按**从大到小排序**。

## 显示格式

```
当前手牌:
  east:
    【主牌】小王 ♠A ♠K ♠Q ♠J ♠10 ♠8 ♠5 ♠3 ♠2
    【♠】(主牌已显示在上方)
    【♥】♥A ♥K ♥Q ♥J ♥10 ♥9 ♥8 ♥7
    【♣】♣A ♣K ♣Q ♣J ♣10
    【♦】♦A ♦K ♦Q ♦J ♦10

  north:
    【主牌】大王 大王 小王 ♥2 ♦2 ♠A ♠K
    【♥】♥A ♥K ♥Q
    【♣】♣A ♣K
    【♦】♦A ♦K
```

## 排序规则

### 主牌顺序（从大到小）
1. 大王（3张）
2. 小王（3张）
3. 主花色级牌（如♥2，红桃主时）
4. 其他花色级牌（同级）
5. 主花色A、K、Q、J、10...（跳过级牌）

### 副牌顺序（从大到小，按花色）
1. ♠ 黑桃（如果主花色是黑桃，则在主牌区显示）
2. ♥ 红桃
3. ♣ 梅花
4. ♦ 方块

每门副牌：A > K > Q > J > 10 > ... > 2（跳过级牌）

## 技术实现

### 修改的文件

1. **`src/engine/game-loop.ts`**
   - `GameLog`接口添加`ctx?: GameContext`字段
   - `log()`方法记录游戏上下文快照

2. **`cli.ts`**
   - 添加`displayHands()`函数，分类显示手牌
   - 修改`printLog()`函数，传入ctx进行排序显示
   - 导入`sortHand`和`classifyCard`函数

### 核心代码

```typescript
// 显示手牌（按主牌、副牌排序）
function displayHands(
  hands: Map<Seat, Card[]>,
  ctx: GameContext,
  showDetail: boolean = true
): void {
  for (const seat of ['east', 'north', 'west', 'south']) {
    const hand = hands.get(seat) || [];
    
    // 按主牌、副牌排序
    const sortedHand = sortHand([...hand], ctx);
    
    // 分类：主牌 + 各花色副牌
    const trumpCards: Card[] = [];
    const suitCards: Map<Suit, Card[]> = new Map();
    
    for (const card of sortedHand) {
      const classInfo = classifyCard(card, ctx);
      if (classInfo === 'trump') {
        trumpCards.push(card);
      } else {
        const suit = classInfo.suit;
        if (!suitCards.has(suit)) suitCards.set(suit, []);
        suitCards.get(suit)!.push(card);
      }
    }
    
    // 显示
    console.log(`  ${seat}:`);
    if (trumpCards.length > 0) {
      console.log(`    【主牌】${trumpCards.map(c => getCardDisplayName(c)).join(' ')}`);
    }
    
    for (const suit of ['spade', 'heart', 'club', 'diamond']) {
      const cards = suitCards.get(suit) || [];
      if (cards.length > 0) {
        const suitName = getSuitDisplayName(suit);
        console.log(`    【${suitName}】${cards.map(c => getCardDisplayName(c)).join(' ')}`);
      }
    }
  }
}
```

## 使用方法

```bash
cd tractor

# 运行一局游戏（详细日志，分类显示手牌）
bun cli.ts

# 或
bun cli.ts play

# 快速运行（无详细日志）
bun cli.ts quick

# 压力测试
bun cli.ts test 1000
```

## 测试结果

```bash
✅ 所有测试通过: 123/123 (100%)
✅ 手牌分类显示正常
✅ 排序规则正确
✅ 压力测试通过（1000局）
```

## 示例输出

**发牌后（亮主前）**：
```
当前手牌:
  east: ♦5 ♠2 ♠10 ♠5 ♦7 ♥5 ♣4 ♣Q ♣6...
  north: 小王 小王 ♦2 ♠A ♠K ♠7...
```

**亮主后（黑桃主）**：
```
当前手牌:
  east:
    【主牌】小王 ♠A ♠K ♠Q ♠J ♠10 ♠8 ♠5 ♠3
    【♥】♥A ♥J ♥J ♥7 ♥6 ♥5 ♥4 ♥4 ♥3
    【♣】♣K ♣K ♣Q ♣J ♣9 ♣9 ♣8...
    【♦】♦A ♦K ♦9 ♦8 ♦7 ♦6...
```

## 注意事项

1. **亮主前**：手牌按原始顺序显示（未分类）
2. **亮主后**：手牌按主牌、副牌分类显示
3. **级牌处理**：级牌（如打2时的所有2）在主牌区显示
4. **主花色副牌**：主花色的牌（除级牌外）也在主牌区显示

## 优势

- ✅ 清晰区分主牌和副牌
- ✅ 方便核对游戏逻辑
- ✅ 符合玩家习惯
- ✅ 易于阅读和理解
