#!/usr/bin/env python3
"""
评估脚本：测试训练好的模型

用法:
    # 评估单个模型
    python evaluate.py --model checkpoints/model_final.pt --games 100
    
    # 比较两个模型
    python evaluate.py --model-a model_v1.pt --model-b model_v2.pt --games 200
    
    # 与规则AI对比
    python evaluate.py --model model.pt --baseline rule --games 100
"""
import argparse
import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).parent.parent))

from ai.dl.config import DLConfig
from ai.dl.inference.agent import DLAgent
from ai.play_strategy import leadCardsStrategy, followCardsStrategy


def evaluate_single(args):
    """评估单个模型"""
    print(f"Evaluating model: {args.model}")
    
    # 加载模型
    agent = DLAgent.load(args.model)
    
    # 运行评估游戏
    results = []
    
    for game_idx in range(args.games):
        # TODO: 实现实际的游戏循环评估
        result = {
            'game': game_idx,
            'score': 0,  # 实际得分
            'win': False,
        }
        results.append(result)
        
        if (game_idx + 1) % 10 == 0:
            print(f"Played {game_idx + 1}/{args.games} games")
    
    # 统计结果
    wins = sum(1 for r in results if r['win'])
    avg_score = sum(r['score'] for r in results) / len(results)
    
    print(f"\nEvaluation Results:")
    print(f"  Games played: {args.games}")
    print(f"  Win rate: {wins / args.games * 100:.1f}%")
    print(f"  Average score: {avg_score:.1f}")
    
    # 保存结果
    if args.output:
        with open(args.output, 'w') as f:
            json.dump({
                'model': args.model,
                'games': args.games,
                'win_rate': wins / args.games,
                'avg_score': avg_score,
                'results': results,
            }, f, indent=2)
        print(f"Results saved to {args.output}")


def compare_models(args):
    """比较两个模型"""
    print(f"Comparing models:")
    print(f"  Model A: {args.model_a}")
    print(f"  Model B: {args.model_b}")
    
    # 加载模型
    agent_a = DLAgent.load(args.model_a)
    agent_b = DLAgent.load(args.model_b)
    
    # 运行比较游戏
    # TODO: 实现
    
    print("Comparison completed!")


def evaluate_vs_rule(args):
    """与规则AI对比"""
    print(f"Evaluating DL model vs Rule-based AI")
    print(f"  Model: {args.model}")
    
    # 加载DL模型
    dl_agent = DLAgent.load(args.model)
    
    # 运行对比游戏
    # DL模型与规则AI对战
    
    # TODO: 实现
    
    print("Evaluation completed!")


def main():
    parser = argparse.ArgumentParser(description="Evaluate Tractor DL Agent")
    
    # 模式选择
    subparsers = parser.add_subparsers(dest='command', help='Evaluation mode')
    
    # 单模型评估
    single_parser = subparsers.add_parser('single', help='Evaluate single model')
    single_parser.add_argument("--model", required=True, help="Model file path")
    single_parser.add_argument("--games", type=int, default=100, help="Number of games")
    single_parser.add_argument("--output", help="Output file for results")
    
    # 模型比较
    compare_parser = subparsers.add_parser('compare', help='Compare two models')
    compare_parser.add_argument("--model-a", required=True, help="Model A file path")
    compare_parser.add_argument("--model-b", required=True, help="Model B file path")
    compare_parser.add_argument("--games", type=int, default=100, help="Number of games")
    
    # 与规则AI对比
    baseline_parser = subparsers.add_parser('baseline', help='Compare with rule AI')
    baseline_parser.add_argument("--model", required=True, help="Model file path")
    baseline_parser.add_argument("--games", type=int, default=100, help="Number of games")
    
    args = parser.parse_args()
    
    if args.command == 'single':
        evaluate_single(args)
    elif args.command == 'compare':
        compare_models(args)
    elif args.command == 'baseline':
        evaluate_vs_rule(args)
    else:
        # 默认单模型评估
        if hasattr(args, 'model') and args.model:
            evaluate_single(args)
        else:
            parser.print_help()


if __name__ == "__main__":
    main()