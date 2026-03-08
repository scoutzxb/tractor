import { serve } from "bun";
import { GameEngine } from "./src/engine/game-loop";
import { createAIPlayer } from "./src/engine/ai-player";
import type { Card, Seat, Rank, GameContext } from "./src/core/types";
import type { GameState, Player } from "./src/engine/game-loop";

// 房间管理
interface Room {
  id: string;
  players: Map<Seat, { ws: WebSocket; name: string }>;
  engine: GameEngine;
  gameState: GameState;
  isStarted: boolean;
  gameMode: 'single' | 'dual' | 'four';  // 游戏模式
  aiPlayers: Map<Seat, Player>;  // AI玩家
}

const rooms = new Map<string, Room>();

// 生成房间ID
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 广播消息
function broadcast(room: Room, message: any, excludeSeat?: Seat) {
  const data = JSON.stringify(message);
  room.players.forEach((player, seat) => {
    if (seat !== excludeSeat && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

// 序列化游戏状态（去除循环引用）
function serializeGameState(state: GameState) {
  return {
    level: state.level,
    dealer: state.dealer,
    hands: Array.from(state.hands.entries()),
    kitty: state.kitty,
    trumpState: state.trumpState,
    ctx: state.ctx,
    scores: Array.from(state.scores.entries()),
    roundNumber: state.roundNumber,
    currentLeader: state.currentLeader,
    lastTrick: state.lastTrick,
    lastWinner: state.lastWinner,
    isOver: state.isOver,
    winner: state.winner,
    currentTrick: (state as any).currentTrick || [],
  };
}

// 创建HTTP服务器 + WebSocket
serve({
  port: 8080,
  
  async fetch(req, server) {
    const url = new URL(req.url);
    
    // WebSocket升级
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }
    
    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    
    // API路由
    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok", rooms: rooms.size }, { headers });
    }
    
    return new Response("Not found", { status: 404, headers });
  },
  
  websocket: {
    open(ws: any) {
      ws.data = { room: null, seat: null };
    },
    
    message(ws: any, message: string) {
      try {
        const data = JSON.parse(message);
        handleMessage(ws, data);
      } catch (err) {
        console.error("Failed to parse message:", err);
        ws.send(JSON.stringify({ type: "error", data: { message: "Invalid message format" } }));
      }
    },
    
    close(ws: any) {
      const { room, seat } = ws.data;
      if (room && seat) {
        const roomData = rooms.get(room);
        if (roomData) {
          roomData.players.delete(seat);
          broadcast(roomData, {
            type: "player_left",
            data: { seat },
          });
        }
      }
    },
  },
});

// 处理消息
async function handleMessage(ws: any, data: any) {
  const { type, data: payload } = data;
  
  switch (type) {
    case "quick_start": {
      // 快速开始单人模式（1人 + 3 AI）
      await handleQuickStart(ws, payload);
      break;
    }
    
    case "create_room": {
      const roomId = generateRoomId();
      const gameMode = payload.gameMode || 'single';
      
      const room: Room = {
        id: roomId,
        players: new Map(),
        engine: new GameEngine("2", "south", false, Date.now()),
        gameState: {} as GameState,
        isStarted: false,
        gameMode,
        aiPlayers: new Map(),
      };
      
      // 初始化游戏引擎
      room.gameState = room.engine.getState();
      
      // 添加创建者（默认南家）
      const seat: Seat = "south";
      room.players.set(seat, { ws, name: payload.playerName });
      ws.data = { room: roomId, seat };
      
      rooms.set(roomId, room);
      
      ws.send(JSON.stringify({
        type: "room_created",
        data: { roomId, seat, gameMode },
      }));
      
      break;
    }
    
    case "join_room": {
      const { roomId, playerName, seat } = payload;
      const room = rooms.get(roomId);
      
      if (!room) {
        ws.send(JSON.stringify({
          type: "error",
          data: { message: "房间不存在" },
        }));
        return;
      }
      
      if (room.players.has(seat)) {
        ws.send(JSON.stringify({
          type: "error",
          data: { message: "座位已被占用" },
        }));
        return;
      }
      
      room.players.set(seat, { ws, name: playerName });
      ws.data = { room: roomId, seat };
      
      // 通知所有玩家
      broadcast(room, {
        type: "player_joined",
        data: { seat, playerName },
      });
      
      // 发送当前房间状态
      ws.send(JSON.stringify({
        type: "room_state",
        data: {
          roomId,
          gameMode: room.gameMode,
          players: Array.from(room.players.entries()).map(([s, p]) => ({
            seat: s,
            name: p.name,
          })),
        },
      }));
      
      break;
    }
    
    case "start_game": {
      const { room: roomId } = ws.data;
      const room = rooms.get(roomId);
      
      if (!room) {
        ws.send(JSON.stringify({
          type: "error",
          data: { message: "房间不存在" },
        }));
        return;
      }
      
      await startGame(room);
      break;
    }
    
    case "player_action": {
      const { room: roomId, seat } = ws.data;
      const room = rooms.get(roomId);
      
      if (!room || !seat) {
        return;
      }
      
      // 处理玩家动作
      const result = await processPlayerAction(room, seat, payload);
      
      if (result.success) {
        // 更新状态并发送给所有玩家
        room.gameState = room.engine.getState();
        sendGameStateToAll(room);
        
        // 触发AI动作
        await triggerAIActions(room);
      } else {
        ws.send(JSON.stringify({
          type: "error",
          data: { message: result.error },
        }));
      }
      
      break;
    }
  }
}

// 快速开始单人模式
async function handleQuickStart(ws: any, payload: { playerName: string }) {
  const roomId = generateRoomId();
  
  const room: Room = {
    id: roomId,
    players: new Map(),
    engine: new GameEngine("2", "south", false, Date.now()),
    gameState: {} as GameState,
    isStarted: false,
    gameMode: 'single',
    aiPlayers: new Map(),
  };
  
  // 初始化游戏引擎
  room.gameState = room.engine.getState();
  
  // 添加玩家（南家）
  const playerSeat: Seat = "south";
  room.players.set(playerSeat, { ws, name: payload.playerName || "玩家" });
  ws.data = { room: roomId, seat: playerSeat };
  
  // 添加3个AI玩家
  const aiSeats: Seat[] = ["east", "north", "west"];
  for (const seat of aiSeats) {
  const ai = createAIPlayer(seat, `AI-${seat.toUpperCase()}`);
    room.aiPlayers.set(seat, ai);
    room.engine.registerPlayer(ai);
  }
  
  rooms.set(roomId, room);
  
  // 发送房间创建消息
  ws.send(JSON.stringify({
    type: "room_created",
    data: { roomId, seat: playerSeat, gameMode: 'single' },
  }));
  
  // 立即开始游戏
  await startGame(room);
}

// 开始游戏
async function startGame(room: Room) {
  console.log(`\n🎮 开始游戏 [房间: ${room.id}, 模式: ${room.gameMode}]`);
  
  // 为所有玩家注册
  const allSeats: Seat[] = ["east", "north", "west", "south"];
  
  for (const seat of allSeats) {
    if (!room.players.has(seat) && !room.aiPlayers.has(seat)) {
      // 如果不是真人玩家也不是AI，创建一个AI
      const ai = createAIPlayer(seat, `AI-${seat.toUpperCase()}`);
      room.aiPlayers.set(seat, ai);
    }
    
    // 注册玩家到引擎
    if (room.aiPlayers.has(seat)) {
      room.engine.registerPlayer(room.aiPlayers.get(seat)!);
    } else if (room.players.has(seat)) {
      // 真人玩家 - 创建一个简单的player接口
      room.engine.registerPlayer({
        seat,
        name: room.players.get(seat)!.name,
        chooseTrump: async () => null, // 人类玩家通过UI操作
        chooseChaoDi: async () => null,
        discardKitty: async () => [],  // 人类玩家通过UI操作
        playCards: async () => [],     // 人类玩家通过UI操作
      });
    }
  }
  
  // 开始游戏
  room.isStarted = true;
  
  // 发牌
  console.log("  📤 发牌中...");
  room.engine.dealCards();
  room.gameState = room.engine.getState();
  
  // 通知所有玩家游戏开始
  broadcast(room, {
    type: "game_started",
    data: { roomId: room.id, gameMode: room.gameMode },
  });
  
  // 发送游戏状态
  sendGameStateToAll(room);
  
  // 自动运行亮主阶段
  await runTrumpDeclaration(room);
}

// 运行亮主阶段
async function runTrumpDeclaration(room: Room) {
  console.log("  🎯 亮主阶段...");
  
  // AI玩家自动亮主
  const state = room.gameState;
  
  for (const [seat, ai] of room.aiPlayers) {
    const hand = state.hands.get(seat) || [];
    const trumpCards = ai.chooseTrump(hand, state.level, state.trumpState);
    
    if (trumpCards && trumpCards.length > 0) {
      console.log(`  🤖 AI-${seat.toUpperCase()} 亮主`);
      room.engine.tryDeclare(seat, trumpCards);
      await delay(500);
    }
  }
  
  // 完成亮主阶段
  room.engine.finalizeTrumpPhase();
  room.gameState = room.engine.getState();
  sendGameStateToAll(room);
  
  // 如果庄家是AI，自动扣底
  const dealer = room.gameState.dealer;
  if (room.aiPlayers.has(dealer)) {
    await runDiscardPhase(room);
  }
}

// 运行扣底阶段
async function runDiscardPhase(room: Room) {
  console.log("  📥 扣底阶段...");
  
  const dealer = room.gameState.dealer;
  const ai = room.aiPlayers.get(dealer);
  
  if (ai) {
    const hand = room.gameState.hands.get(dealer) || [];
    const discardCards = ai.discardKitty(hand, room.gameState.kitty, room.gameState.ctx!);
    
    console.log(`  🤖 AI-${dealer.toUpperCase()} 扣底`);
    room.engine.discardPhase();
    
    room.gameState = room.engine.getState();
    sendGameStateToAll(room);
    await delay(500);
  }
  
  // 开始出牌阶段
  await runPlayPhase(room);
}

// 运行出牌阶段
async function runPlayPhase(room: Room) {
  console.log("  🃏 出牌阶段开始...");
  
  // 运行整个出牌阶段（引擎会自动处理）
  room.engine.playPhase();
  
  room.gameState = room.engine.getState();
  sendGameStateToAll(room);
  
  // 计算结果
  room.engine.settlePhase();
  room.gameState = room.engine.getState();
  sendGameStateToAll(room);
  
  console.log("  🏁 游戏结束");
}

// 处理玩家动作
async function processPlayerAction(
  room: Room,
  seat: Seat,
  action: any
): Promise<{ success: boolean; error?: string }> {
  const engine = room.engine;
  const state = room.gameState;
  
  try {
    switch (action.type) {
      case "declare": {
        // 亮主
        console.log(`  🎯 ${seat} 亮主:`, action.cards.map((c: Card) => c.joker ? c.joker : `${c.suit}${c.rank}`));
        const success = engine.tryDeclare(seat, action.cards);
        return { success };
      }
      
      case "pass": {
        // 不亮主
        console.log(`  ⏭️  ${seat} 不亮主`);
        return { success: true };
      }
      
      case "discard": {
        // 扣底 - 简化处理，使用引擎的discardPhase
        if (action.cards.length !== 6) {
          return { success: false, error: "需要扣6张底牌" };
        }
        console.log(`  📥 ${seat} 扣底`);
        engine.discardPhase();
        return { success: true };
      }
      
      case "play": {
        // 出牌 - 简化处理，使用引擎的playPhase
        console.log(`  🃏 ${seat} 出牌:`, action.cards.map((c: Card) => c.joker ? c.joker : `${c.suit}${c.rank}`));
        // 这里需要更精细的处理，暂时使用playPhase
        return { success: true };
      }
      
      default:
        return { success: false, error: "未知动作" };
    }
  } catch (err) {
    console.error(`  ❌ 动作执行失败:`, err);
    return { success: false, error: String(err) };
  }
}

// 触发AI动作（简化版本）
async function triggerAIActions(room: Room) {
  // 当前版本，AI动作已经在startGame中自动处理
  // 如果需要更精细的控制，可以在这里添加逻辑
}

// 辅助函数：延迟
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 发送游戏状态给所有玩家
function sendGameStateToAll(room: Room) {
  const state = serializeGameState(room.gameState);
  
  room.players.forEach((player, seat) => {
    if (player.ws.readyState !== WebSocket.OPEN) return;
    
    // 为每个玩家过滤手牌（只发送自己的手牌）
    const playerState = {
      ...state,
      hands: state.hands.filter(([s]: [Seat, Card[]]) => s === seat),
      allHands: state.hands.map(([s, cards]: [Seat, Card[]]) => ({
        seat: s,
        count: cards.length,
      })),
    };
    
    player.ws.send(JSON.stringify({
      type: "game_state",
      data: {
        state: playerState,
        phase: getCurrentPhase(room.gameState),
        currentPlayer: room.gameState.currentLeader,
        validActions: getValidActions(room.gameState, seat),
      },
    }));
  });
}

// 获取当前阶段
function getCurrentPhase(state: GameState): string {
  if (state.isOver) return "game_over";
  if (!state.ctx) return "trump_declaration";
  if (state.hands.get(state.dealer)?.length === 39) return "playing"; // 扣底后39张
  if ((state as any).kittyDiscardRequired) return "kitty_management";
  return "playing";
}

// 获取有效动作
function getValidActions(state: GameState, seat: Seat): any[] {
  const phase = getCurrentPhase(state);
  const actions: any[] = [];
  
  if (phase === "trump_declaration") {
    // 可以亮主或不亮主
    actions.push({ type: "pass" });
    // TODO: 根据手牌判断可以亮什么
  }
  
  if (phase === "kitty_management" && seat === state.dealer) {
    actions.push({ type: "discard" });
  }
  
  if (phase === "playing" && seat === state.currentLeader) {
    actions.push({ type: "play" });
  }
  
  return actions;
}

console.log("🚀 Server running on http://localhost:8080");
console.log("🎮 WebSocket available at ws://localhost:8080/ws");
console.log("📝 游戏模式:");
console.log("   - 单人模式: 1人 + 3 AI");
console.log("   - 双人模式: 2人 + 2 AI");
console.log("   - 四人模式: 4人");
