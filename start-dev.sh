#!/bin/bash

# 拖拉机游戏开发模式启动脚本

echo "🎮 启动拖拉机游戏开发环境..."
echo ""

# 检查是否已经安装依赖
if [ ! -d "frontend/node_modules" ]; then
  echo "📦 安装前端依赖..."
  cd frontend
  bun install
  cd ..
  echo ""
fi

# 启动后端服务器（后台）
echo "🚀 启动后端服务器..."
bun run server.ts > /tmp/tractor-server.log 2>&1 &
BACKEND_PID=$!
echo "   后端PID: $BACKEND_PID"
sleep 2

echo ""
echo "✅ 服务器启动成功！"
echo ""
echo "📍 访问地址:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:8080"
echo "   WebSocket: ws://localhost:8080/ws"
echo ""
echo "🎯 游戏模式:"
echo "   - 快速开始: 单人模式，与3个AI对战"
echo "   - 创建房间: 选择游戏模式（单人/双人/四人）"
echo "   - 加入房间: 输入房间号加入游戏"
echo ""
echo "💡 提示:"
echo "   - 按 Ctrl+C 停止服务器"
echo "   - 查看日志: tail -f /tmp/tractor-server.log"
echo ""

# 捕获退出信号
trap "echo ''; echo '🛑 停止服务器...'; kill $BACKEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# 启动前端开发服务器
cd frontend
bun run dev

# 清理
kill $BACKEND_PID 2>/dev/null
