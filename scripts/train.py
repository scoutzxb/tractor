#!/usr/bin/env python3
"""
训练脚本

用法:
    # 使用强化学习训练
    python train.py --mode rl --iterations 100 --games 1000
    
    # 从检查点继续训练
    python train.py --mode rl --checkpoint checkpoints/model_iter_50.pt
    
    # 使用监督学习预训练
    python train.py --mode sl --data expert_games.json
"""
import argparse
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from ai.dl.config import DLConfig
from ai.dl.models.policy_net import create_policy_network
from ai.dl.models.encoder import StateEncoder
from ai.dl.data.generator import DataGenerator
from ai.dl.training.trainer import PPOTrainer, SupervisedTrainer
from ai.dl.inference.agent import DLAgent


def train_rl(args):
    """强化学习训练"""
    print("Starting reinforcement learning training...")
    
    # 创建配置
    config = DLConfig.default()
    config.training.num_epochs = args.epochs
    config.training.learning_rate = args.lr
    config.training.batch_size = args.batch_size
    config.training.device = args.device
    
    # 创建策略网络
    policy_net = create_policy_network(
        hidden_dim=args.hidden_dim,
        num_heads=args.num_heads,
        num_layers=args.num_layers,
        with_value=True,
    )
    
    # 创建编码器
    encoder = StateEncoder(config.model)
    
    # 创建训练器
    trainer = PPOTrainer(policy_net, config.training, args.device)
    
    # 加载检查点
    start_iter = 0
    if args.checkpoint:
        print(f"Loading checkpoint from {args.checkpoint}")
        start_iter = trainer.load_checkpoint(args.checkpoint)
    
    # 创建数据生成器
    data_gen = DataGenerator(policy_net, encoder, config)
    
    # 开始训练
    stats = trainer.train(
        data_generator=data_gen,
        num_iterations=args.iterations,
        games_per_iter=args.games,
        batch_size=args.batch_size,
        save_dir=args.save_dir,
    )
    
    print("Training completed!")
    print(f"Final policy loss: {stats['policy_loss'][-1]:.4f}")
    print(f"Final value loss: {stats['value_loss'][-1]:.4f}")
    
    # 保存最终模型
    final_path = Path(args.save_dir) / "model_final.pt"
    trainer.save_checkpoint(final_path, args.iterations)
    print(f"Final model saved to {final_path}")


def train_sl(args):
    """监督学习训练"""
    print("Starting supervised learning training...")
    print(f"Loading expert data from {args.data}")
    
    # 创建配置
    config = DLConfig.default()
    config.training.num_epochs = args.epochs
    config.training.learning_rate = args.lr
    config.training.device = args.device
    
    # 创建策略网络
    policy_net = create_policy_network(
        hidden_dim=args.hidden_dim,
        with_value=False,  # 监督学习不需要价值头
    )
    
    # 创建训练器
    trainer = SupervisedTrainer(policy_net, config.training, args.device)
    
    # 加载数据
    # TODO: 实现数据加载
    from torch.utils.data import DataLoader
    # dataloader = load_expert_data(args.data)
    
    # 训练
    # stats = trainer.train(dataloader, args.epochs, args.save_dir)
    
    print("Supervised learning training completed!")


def main():
    parser = argparse.ArgumentParser(description="Train Tractor DL Agent")
    
    # 训练模式
    parser.add_argument("--mode", choices=["rl", "sl"], default="rl",
                        help="Training mode: rl (reinforcement learning) or sl (supervised learning)")
    
    # 训练参数
    parser.add_argument("--iterations", type=int, default=100,
                        help="Number of training iterations")
    parser.add_argument("--epochs", type=int, default=10,
                        help="Epochs per iteration")
    parser.add_argument("--games", type=int, default=100,
                        help="Games to generate per iteration")
    parser.add_argument("--batch-size", type=int, default=64,
                        help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-4,
                        help="Learning rate")
    
    # 模型参数
    parser.add_argument("--hidden-dim", type=int, default=256,
                        help="Hidden dimension")
    parser.add_argument("--num-heads", type=int, default=8,
                        help="Number of attention heads")
    parser.add_argument("--num-layers", type=int, default=4,
                        help="Number of transformer layers")
    
    # 其他参数
    parser.add_argument("--device", default="auto",
                        help="Device (auto/cuda/cpu/mps)")
    parser.add_argument("--save-dir", default="checkpoints",
                        help="Directory to save checkpoints")
    parser.add_argument("--checkpoint", default=None,
                        help="Checkpoint to resume from")
    parser.add_argument("--data", default=None,
                        help="Expert data file (for SL mode)")
    
    args = parser.parse_args()
    
    if args.mode == "rl":
        train_rl(args)
    elif args.mode == "sl":
        train_sl(args)


if __name__ == "__main__":
    main()