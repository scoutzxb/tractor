# 拖拉机游戏 - AI问题修复总结

## 已修复

### ✅ 问题2：AI扣底牌
- **问题**：AI扣大牌（♥2 ♣2 ♥A ♥A ♥K ♥Q）
- **修复**：修改`discardKitty`，保留前39张最大的牌
- **验证**：底牌现在是小牌（♦9 ♦8 ♦7 ♦5 ♦4 ♦3）

## 待修复

### ❌ 问题1：AI不亮主
- **现象**：所有局都是"无人亮主，翻底牌"
- **原因**：
  1. `chooseTrump`返回null
  2. 或`canDeclare`检查失败
- **调试**：需要检查`canDeclare`和`analyzeDeclaration`

### ❌ 问题3：AI只出单牌
- **现象**：AI一直出单牌（大王），不出对子、拖拉机
- **可能原因**：
  1. `isTrump`判断错误，把所有牌都识别为主牌
  2. `parseCards`没有正确识别牌型
  3. AI逻辑中`nonTrumpComponents`为空

## 下一步调试

1. 检查`canDeclare`和`analyzeDeclaration`函数
2. 检查`isTrump`在翻底牌后的判断
3. 添加调试日志到`playAsLeader`方法

## 测试命令

```bash
cd /home/workspace/tractor

# 运行1局游戏查看详细日志
bun cli.ts play

# 运行压力测试
bun cli.ts test 100

# 运行单元测试
bun test
```
