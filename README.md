# 拖拉机（升级）游戏 - Web版

基于3副牌的拖拉机（升级）纸牌游戏完整实现，支持**单人模式**、**双人对战**和**四人联机**。

## 在线试玩

**https://tractor-game-carnegiexzheng.zocomputer.io**

- 单机模式：一人对战3个AI
- 双人模式：邀请朋友一起玩（南北家对人类，东西家是AI）
- 四人模式：4位玩家分别控制东南西北四个座位

## 项目状态

✅ **核心引擎** - 完整的拖拉机规则实现（100%）  
✅ **Web服务** - 支持单人、双人和四人在线对战（100%）  
✅ **AI对手** - 自动亮主、炒底、出牌

## 功能特性

### 游戏模式
- ✅ **单人模式** - 一人 vs 3个AI
- ✅ **双人模式** - 两人联网对战（各控制南北家）
- ✅ **四人模式** - 四人联网对战（各控制一个座位）
- ✅ **普通局** - 庄家模式
- ✅ **抢庄局** - 亮主者成为庄家

### 游戏流程
- ✅ 边发牌边亮主
- ✅ 亮主/反主/补亮
- ✅ 庄家扣底
- ✅ 炒底轮询（可连续炒底）
- ✅ 完整39轮出牌
- ✅ 自动计分、升级、换庄

### AI功能
- ✅ 自动亮主策略
- ✅ 自动炒底决策
- ✅ 智能出牌（领牌、跟牌、杀牌）
- ✅ 扣底优化

### 牌型支持
- ✅ 所有牌型：单张、对子、三张、拖拉机、超级拖拉机
- ✅ 甩牌校验（同门牌、高阶隐含低阶）
- ✅ 跟牌引擎（强制跟牌、结构匹配）
- ✅ 杀牌比较（主牌杀副牌）

## 快速开始

### 本地运行

```bash
# 安装依赖（包含前端）
bun install
cd webapp && bun install

# 启动后端 Web 服务
bun run web-deal-service.ts

# 启动前端（另一个 shell）
cd webapp && bun run dev

# 浏览器打开 http://localhost:8787
```

### 运行测试

```bash
bun test
```

## 项目结构

```
tractor/
├── package.json           # 统一 scripts（后端、前端 helper）
├── web-deal-service.ts    # Bun 入口/后端服务
├── run-multi-round-logs.ts  # 批量测试脚本
├── src/
│   ├── core/              # 核心逻辑
│   │   ├── deck.ts        # 牌库与排序
│   │   ├── parser.ts      # 牌型解析
│   │   ├── lead-validator.ts    # 甩牌校验
│   │   ├── follow-validator.ts  # 跟牌引擎
│   │   ├── kill-validator.ts    # 杀牌校验
│   │   ├── scoring.ts     # 计分升级
│   │   └── trump-state.ts # 亮主状态机
│   ├── ai/
│   │   ├── chaodi-strategy.ts   # 炒底策略
│   │   ├── discard-strategy.ts  # 扣底策略
│   │   ├── play-strategy.ts     # 出牌策略
│   │   └── trump-strategy.ts    # 亮主策略
│   └── engine/
│       └── game-loop.ts   # 游戏主循环
├── webapi/               # Web 服务端
│   ├── routes/           # API 路由
│   └── game-logger.ts    # 游戏日志
├── webapp/               # React+Vite 前端
│   ├── package.json       # 前端 dev/build 脚本
│   └── src/
│       └── App.tsx       # 主界面
├── tests/                # Bun test 单元测试
│   └── *.test.ts
└── WHITELIST.md          # 记录仓库保留的文件
```

## 技术栈

- **后端**: Bun + TypeScript + Hono
- **前端**: React + Vite + Tailwind CSS
- **测试**: Bun Test

## 许可证

MIT
