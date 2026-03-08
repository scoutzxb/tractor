#!/bin/bash

# 拖拉机游戏启动脚本

echo "🎮 启动拖拉机游戏..."
echo ""

# 检查是否已经安装依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 安装前端依赖..."
    cd frontend && bun install
    cd ..
fi

echo "🚀 启动服务器..."
echo "   后端: http://localhost:8080"
echo "   前端: http://localhost:3000"
echo ""
echo "💡 提示:"
echo "   - 后端WebSocket: ws://localhost:8080/ws"
echo "   - 按 Ctrl+C 停止服务器"
echo ""

# 启动后端服务器（后台运行）
bun run server.ts &
BACKEND_PID=$!

# 等待后端启动
sleep 2

# 启动前端开发服务器
cd frontend
bun run dev

# 清理
kill $BACKEND_PID 2>/dev/null
