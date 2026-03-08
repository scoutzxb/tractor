#!/usr/bin/env bun
/**
 * 日志处理脚本
 * 
 * 解析对局日志，生成每轮公共信息快照
 * 输出：人类可读格式 + 张量编码格式
 */

import { GameLogProcessor, type ParsedGame, type RoundPublicInfo } from './game-log-parser';
import type { PublicInfoTensor } from './public-info-encoder';
import * as fs from 'fs';
import * as path from 'path';

// 配置
const LOGS_DIR = '/home/workspace/tractor/game-logs-123';
const OUTPUT_DIR = '/home/workspace/tractor/game-logs-processed';

// 确保输出目录存在
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 格式化张量为JSON可读格式
function formatTensorJson(tensor: PublicInfoTensor): object {
  return {
    roundNumber: tensor.roundNumber,
    attackScore: tensor.attackScore,
    playedCardsMatrix: tensor.playedCardsMatrix.map(row => 
      row.map(v => Math.round(v * 10) / 10) // 保留1位小数
    ),
    remainingCounts: tensor.remainingCounts.map(v => Math.round(v * 39)),
    voidMatrix: tensor.voidMatrix,
    scoreCardsPlayed: tensor.scoreCardsPlayed.map(v => Math.round(v)),
    historyVector: tensor.historyVector.slice(0, 50).map(v => Math.round(v * 100) / 100) // 只显示前50维
  };
}

// 处理单个日志文件
function processLogFile(logPath: string, outputDir: string): void {
  const basename = path.basename(logPath, '.md');
  console.log(`\n处理: ${basename}`);
  
  const processor = new GameLogProcessor();
  const result = processor.processFile(logPath);
  
  if (!result) {
    console.log(`  解析失败`);
    return;
  }
  
  const { game, roundInfos } = result;
  
  // 创建输出目录
  const gameOutputDir = path.join(outputDir, basename);
  ensureDir(gameOutputDir);
  
  // 1. 生成人类可读文件
  const humanPath = path.join(gameOutputDir, 'public-info-readable.txt');
  const humanLines: string[] = [];
  
  humanLines.push(`第 ${game.gameId} 局公共信息跟踪记录`);
  humanLines.push(`主花色: ${game.trumpSuit || '无主'}, 庄家: ${game.dealer}`);
  humanLines.push(`总轮数: ${roundInfos.length}`);
  
  for (const info of roundInfos) {
    humanLines.push(info.humanReadable);
  }
  
  fs.writeFileSync(humanPath, humanLines.join('\n'));
  console.log(`  生成: ${humanPath}`);
  
  // 2. 生成张量编码文件（JSON格式）
  const tensorPath = path.join(gameOutputDir, 'public-info-tensors.json');
  const tensorData = {
    gameId: game.gameId,
    trumpSuit: game.trumpSuit,
    dealer: game.dealer,
    rounds: roundInfos.map(info => ({
      round: info.round,
      tensor: formatTensorJson(info.tensor)
    }))
  };
  
  fs.writeFileSync(tensorPath, JSON.stringify(tensorData, null, 2));
  console.log(`  生成: ${tensorPath}`);
  
  // 3. 生成二进制格式（用于训练）
  const binaryPath = path.join(gameOutputDir, 'public-info-binary.bin');
  const binaryData: number[] = [];
  
  for (const info of roundInfos) {
    const tensor = info.tensor;
    // 标量
    binaryData.push(tensor.roundNumber / 39); // 归一化
    binaryData.push(tensor.attackScore / 360);
    // 矩阵展平
    binaryData.push(...tensor.playedCardsMatrix.flat());
    // 向量
    binaryData.push(...tensor.remainingCounts);
    binaryData.push(...tensor.voidMatrix.flat());
    binaryData.push(...tensor.scoreCardsPlayed);
    binaryData.push(...tensor.historyVector);
  }
  
  const buffer = Buffer.from(new Float32Array(binaryData).buffer);
  fs.writeFileSync(binaryPath, buffer);
  console.log(`  生成: ${binaryPath} (${buffer.length} bytes)`);
  
  console.log(`  总轮数: ${roundInfos.length}`);
}

// 主函数
function main(): void {
  console.log('=== 对局日志处理 ===');
  console.log(`输入目录: ${LOGS_DIR}`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
  
  ensureDir(OUTPUT_DIR);
  
  // 获取所有日志文件
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('game_') && f.endsWith('.md'))
    .sort();
  
  console.log(`\n找到 ${files.length} 个日志文件`);
  
  let success = 0;
  let failed = 0;
  
  for (const file of files.slice(0, 5)) { // 先处理前5个文件测试
    const logPath = path.join(LOGS_DIR, file);
    try {
      processLogFile(logPath, OUTPUT_DIR);
      success++;
    } catch (error) {
      console.log(`  错误: ${error}`);
      failed++;
    }
  }
  
  console.log(`\n=== 处理完成 ===`);
  console.log(`成功: ${success}, 失败: ${failed}`);
  
  // 显示第一个处理结果的示例
  const firstOutput = path.join(OUTPUT_DIR, 'game_001', 'public-info-readable.txt');
  if (fs.existsSync(firstOutput)) {
    console.log(`\n=== 示例输出 (第1局前3轮) ===`);
    const content = fs.readFileSync(firstOutput, 'utf-8');
    const lines = content.split('\n');
    
    // 找到前3轮
    let roundCount = 0;
    for (let i = 0; i < lines.length && roundCount < 3; i++) {
      console.log(lines[i]);
      if (lines[i].includes('轮公共信息快照')) {
        roundCount++;
      }
    }
  }
}

// 运行
main();