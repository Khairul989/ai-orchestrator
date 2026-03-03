/**
 * GRPO Trainer
 * Group Relative Policy Optimization based on DeepSeek GRPO
 *
 * Key Features:
 * - No critic model needed (unlike PPO)
 * - Groups outcomes and computes relative advantages
 * - Works with verifiable rewards (task success)
 * - Training-free approach for orchestrator (updates strategies, not weights)
 */

import { EventEmitter } from 'events';

// ============ Types ============

export interface GRPOConfig {
  groupSize: number; // Outcomes per group
  learningRate: number;
  clipEpsilon: number; // PPO-style clipping
  entropyCoef: number; // Exploration bonus
  valueCoef: number;
  minSamplesForTraining: number;
  maxBatchHistory: number;
}

export interface GRPOBatch {
  prompts: string[];
  responses: string[];
  rewards: number[];
  advantages: number[]; // Computed from group relative
  taskIds: string[];
  timestamp: number;
}

export interface TrainingOutcome {
  taskId: string;
  prompt: string;
  response: string;
  reward: number; // 0-1, task success score
  strategy?: string;
  context?: string;
  timestamp: number;
}

export interface TrainingStats {
  totalOutcomes: number;
  totalBatches: number;
  avgReward: number;
  avgAdvantage: number;
  rewardTrend: number[]; // Last N average rewards
  strategyPerformance: Map<string, { avgReward: number; count: number }>;
}

export interface StrategyUpdate {
  strategyId: string;
  adjustment: number; // Positive = use more, negative = use less
  confidence: number;
  reasoning: string;
}

export interface AgentPerformanceMetric {
  taskId: string;
  totalOutcomes: number;
  avgReward: number;
  recentTrend: 'improving' | 'declining' | 'stable';
  bestStrategy?: string;
  recentRewards: number[];
}

export interface TrainingPattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  avgReward: number;
  confidence: number;
  relatedStrategies: string[];
}

export interface TrainingInsight {
  id: string;
  type: 'optimization' | 'warning' | 'recommendation';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: number;
  relatedStrategy?: string;
}

// ============ GRPO Trainer ============

export class GRPOTrainer extends EventEmitter {
  private static instance: GRPOTrainer | null = null;
  private config: GRPOConfig;
  private outcomes: TrainingOutcome[] = [];
  private batches: GRPOBatch[] = [];
  private stats: TrainingStats;
  private insights: TrainingInsight[] = [];

  private defaultConfig: GRPOConfig = {
    groupSize: 8,
    learningRate: 0.001,
    clipEpsilon: 0.2,
    entropyCoef: 0.01,
    valueCoef: 0.5,
    minSamplesForTraining: 16,
    maxBatchHistory: 100,
  };

  static getInstance(): GRPOTrainer {
    if (!this.instance) {
      this.instance = new GRPOTrainer();
    }
    return this.instance;
  }

  static _resetForTesting(): void {
    this.instance = null;
  }

  private constructor() {
    super();
    this.config = { ...this.defaultConfig };
    this.stats = {
      totalOutcomes: 0,
      totalBatches: 0,
      avgReward: 0,
      avgAdvantage: 0,
      rewardTrend: [],
      strategyPerformance: new Map(),
    };
  }

  configure(config: Partial<GRPOConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): GRPOConfig {
    return { ...this.config };
  }

  // ============ Recording Outcomes ============

  recordOutcome(outcome: Omit<TrainingOutcome, 'timestamp'>): void {
    const fullOutcome: TrainingOutcome = {
      ...outcome,
      timestamp: Date.now(),
    };

    this.outcomes.push(fullOutcome);
    this.stats.totalOutcomes++;

    // Update strategy performance
    if (outcome.strategy) {
      const existing = this.stats.strategyPerformance.get(outcome.strategy) || { avgReward: 0, count: 0 };
      existing.avgReward = (existing.avgReward * existing.count + outcome.reward) / (existing.count + 1);
      existing.count++;
      this.stats.strategyPerformance.set(outcome.strategy, existing);
    }

    // Check if we have enough for a batch
    if (this.outcomes.length >= this.config.groupSize) {
      this.processBatch();
    }

    this.emit('outcome:recorded', fullOutcome);
  }

  // ============ GRPO Core Algorithm ============

  private processBatch(): void {
    if (this.outcomes.length < this.config.groupSize) return;

    // Take a batch of outcomes
    const batchOutcomes = this.outcomes.splice(0, this.config.groupSize);

    const rewards = batchOutcomes.map(o => o.reward);
    const advantages = this.computeAdvantages(rewards);

    const batch: GRPOBatch = {
      prompts: batchOutcomes.map(o => o.prompt),
      responses: batchOutcomes.map(o => o.response),
      rewards,
      advantages,
      taskIds: batchOutcomes.map(o => o.taskId),
      timestamp: Date.now(),
    };

    this.batches.push(batch);

    // Keep bounded history
    if (this.batches.length > this.config.maxBatchHistory) {
      this.batches.shift();
    }

    // Update stats
    this.stats.totalBatches++;
    this.updateStats(batch);

    // Generate strategy updates
    const updates = this.generateStrategyUpdates(batch, batchOutcomes);

    this.emit('batch:processed', { batch, updates });
  }

  computeAdvantages(rewards: number[]): number[] {
    if (rewards.length === 0) return [];

    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const variance = rewards.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rewards.length;
    const std = Math.sqrt(variance);

    // Normalize advantages (avoid division by zero)
    return rewards.map(r => (std > 1e-8 ? (r - mean) / std : r - mean));
  }

  private generateStrategyUpdates(batch: GRPOBatch, outcomes: TrainingOutcome[]): StrategyUpdate[] {
    const updates: StrategyUpdate[] = [];
    const strategyAdvantages = new Map<string, number[]>();

    // Group advantages by strategy
    for (let i = 0; i < outcomes.length; i++) {
      const strategy = outcomes[i].strategy;
      if (strategy) {
        const existing = strategyAdvantages.get(strategy) || [];
        existing.push(batch.advantages[i]);
        strategyAdvantages.set(strategy, existing);
      }
    }

    // Generate updates for each strategy
    for (const [strategyId, advantages] of strategyAdvantages) {
      const avgAdvantage = advantages.reduce((a, b) => a + b, 0) / advantages.length;

      // Only update if we have enough samples and significant advantage
      if (advantages.length >= 2 && Math.abs(avgAdvantage) > 0.1) {
        const adjustment = avgAdvantage * this.config.learningRate;
        const confidence = Math.min(1, advantages.length / this.config.groupSize);

        updates.push({
          strategyId,
          adjustment,
          confidence,
          reasoning:
            avgAdvantage > 0
              ? `Strategy "${strategyId}" performs above average (advantage: ${avgAdvantage.toFixed(2)})`
              : `Strategy "${strategyId}" performs below average (advantage: ${avgAdvantage.toFixed(2)})`,
        });
      }
    }

    return updates;
  }

  // ============ Training Step (Simplified for Orchestrator) ============

  async trainStep(batch: GRPOBatch): Promise<{ loss: number; updates: StrategyUpdate[] }> {
    // In a full implementation, this would update model weights
    // For orchestrator, we return strategy adjustments instead

    const loss = this.computeLoss(batch);
    const updates: StrategyUpdate[] = [];

    // The orchestrator uses this to update its strategy preferences
    // rather than actual model weights

    this.emit('training:step', { loss, batchSize: batch.rewards.length });

    return { loss, updates };
  }

  private computeLoss(batch: GRPOBatch): number {
    // Simplified loss computation
    // In full GRPO: L = -E[min(r*A, clip(r, 1-e, 1+e)*A)] + c1*L_value + c2*entropy

    let policyLoss = 0;
    for (const advantage of batch.advantages) {
      // Simplified: just use advantages directly
      policyLoss -= advantage;
    }

    return policyLoss / batch.advantages.length;
  }

  // ============ Statistics ============

  private updateStats(batch: GRPOBatch): void {
    const n = this.stats.totalBatches - 1;
    const batchAvgReward = batch.rewards.reduce((a, b) => a + b, 0) / batch.rewards.length;
    const batchAvgAdvantage = batch.advantages.reduce((a, b) => a + b, 0) / batch.advantages.length;

    this.stats.avgReward = (this.stats.avgReward * n + batchAvgReward) / (n + 1);
    this.stats.avgAdvantage = (this.stats.avgAdvantage * n + batchAvgAdvantage) / (n + 1);

    // Track reward trend
    this.stats.rewardTrend.push(batchAvgReward);
    if (this.stats.rewardTrend.length > 50) {
      this.stats.rewardTrend.shift();
    }
  }

  getStats(): TrainingStats {
    return {
      ...this.stats,
      strategyPerformance: new Map(this.stats.strategyPerformance),
    };
  }

  // ============ Data Export ============

  exportTrainingData(): {
    outcomes: TrainingOutcome[];
    batches: GRPOBatch[];
    stats: TrainingStats;
  } {
    return {
      outcomes: [...this.outcomes],
      batches: [...this.batches],
      stats: this.getStats(),
    };
  }

  importTrainingData(data: { outcomes: TrainingOutcome[]; batches: GRPOBatch[] }): void {
    this.outcomes.push(...data.outcomes);
    this.batches.push(...data.batches);

    // Recalculate stats
    for (const batch of data.batches) {
      this.updateStats(batch);
    }

    this.emit('data:imported', { outcomes: data.outcomes.length, batches: data.batches.length });
  }

  // ============ Reward Trend Analysis ============

  getRewardTrend(): { improving: boolean; slope: number; recent: number[] } {
    const recent = this.stats.rewardTrend.slice(-10);
    if (recent.length < 2) {
      return { improving: false, slope: 0, recent };
    }

    // Simple linear regression
    const n = recent.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = recent.reduce((a, b) => a + b, 0);
    const sumXY = recent.reduce((sum, y, x) => sum + x * y, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    return {
      improving: slope > 0.01,
      slope,
      recent,
    };
  }

  // ============ Strategy Recommendations ============

  getTopStrategies(limit: number = 5): Array<{ strategy: string; avgReward: number; count: number }> {
    return Array.from(this.stats.strategyPerformance.entries())
      .map(([strategy, data]) => ({ strategy, ...data }))
      .sort((a, b) => b.avgReward - a.avgReward)
      .slice(0, limit);
  }

  getUnderperformingStrategies(threshold: number = 0.5): string[] {
    return Array.from(this.stats.strategyPerformance.entries())
      .filter(([, data]) => data.avgReward < threshold && data.count >= 3)
      .map(([strategy]) => strategy);
  }

  // ============ Agent Performance ============

  getAgentPerformance(): AgentPerformanceMetric[] {
    // Group all recorded outcomes by taskId to build per-agent metrics
    const allOutcomes = [
      ...this.outcomes,
      ...this.batches.flatMap((b, _bi) =>
        b.taskIds.map((taskId, i) => ({
          taskId,
          reward: b.rewards[i],
          strategy: undefined as string | undefined,
          timestamp: b.timestamp,
        }))
      ),
    ];

    const byTask = new Map<string, { rewards: number[]; strategies: string[] }>();
    for (const o of allOutcomes) {
      const entry = byTask.get(o.taskId) || { rewards: [], strategies: [] };
      entry.rewards.push(o.reward);
      if (o.strategy) entry.strategies.push(o.strategy);
      byTask.set(o.taskId, entry);
    }

    return Array.from(byTask.entries()).map(([taskId, data]) => {
      const avg = data.rewards.reduce((a, b) => a + b, 0) / data.rewards.length;
      const recent = data.rewards.slice(-5);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const earlierAvg = data.rewards.length > 5
        ? data.rewards.slice(0, -5).reduce((a, b) => a + b, 0) / (data.rewards.length - 5)
        : avg;

      // Find most common strategy
      const strategyCounts = new Map<string, number>();
      for (const s of data.strategies) {
        strategyCounts.set(s, (strategyCounts.get(s) || 0) + 1);
      }
      const bestStrategy = strategyCounts.size > 0
        ? Array.from(strategyCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        : undefined;

      const diff = recentAvg - earlierAvg;
      const recentTrend: 'improving' | 'declining' | 'stable' =
        diff > 0.05 ? 'improving' : diff < -0.05 ? 'declining' : 'stable';

      return {
        taskId,
        totalOutcomes: data.rewards.length,
        avgReward: avg,
        recentTrend,
        bestStrategy,
        recentRewards: recent,
      };
    });
  }

  // ============ Pattern Detection ============

  getPatterns(): TrainingPattern[] {
    const patterns: TrainingPattern[] = [];
    const strategyPerf = this.stats.strategyPerformance;

    // Pattern: High-performing strategy clusters
    const highPerformers = Array.from(strategyPerf.entries())
      .filter(([, d]) => d.avgReward > 0.7 && d.count >= 3);

    if (highPerformers.length > 0) {
      patterns.push({
        id: 'high-performers',
        name: 'High-Performing Strategies',
        description: `${highPerformers.length} strategies consistently achieve >70% reward`,
        frequency: highPerformers.reduce((sum, [, d]) => sum + d.count, 0),
        avgReward: highPerformers.reduce((sum, [, d]) => sum + d.avgReward, 0) / highPerformers.length,
        confidence: Math.min(1, highPerformers.reduce((sum, [, d]) => sum + d.count, 0) / 20),
        relatedStrategies: highPerformers.map(([s]) => s),
      });
    }

    // Pattern: Underperforming strategies
    const lowPerformers = Array.from(strategyPerf.entries())
      .filter(([, d]) => d.avgReward < 0.4 && d.count >= 3);

    if (lowPerformers.length > 0) {
      patterns.push({
        id: 'low-performers',
        name: 'Underperforming Strategies',
        description: `${lowPerformers.length} strategies consistently score <40% reward`,
        frequency: lowPerformers.reduce((sum, [, d]) => sum + d.count, 0),
        avgReward: lowPerformers.reduce((sum, [, d]) => sum + d.avgReward, 0) / lowPerformers.length,
        confidence: Math.min(1, lowPerformers.reduce((sum, [, d]) => sum + d.count, 0) / 20),
        relatedStrategies: lowPerformers.map(([s]) => s),
      });
    }

    // Pattern: Reward trend direction
    const trend = this.getRewardTrend();
    if (trend.recent.length >= 5) {
      patterns.push({
        id: 'reward-trend',
        name: trend.improving ? 'Improving Performance' : 'Performance Plateau',
        description: trend.improving
          ? `Overall rewards trending upward (slope: ${trend.slope.toFixed(3)})`
          : `Rewards are ${trend.slope < -0.01 ? 'declining' : 'stable'} (slope: ${trend.slope.toFixed(3)})`,
        frequency: trend.recent.length,
        avgReward: trend.recent.reduce((a, b) => a + b, 0) / trend.recent.length,
        confidence: Math.min(1, trend.recent.length / 10),
        relatedStrategies: [],
      });
    }

    // Pattern: Strategy diversity
    if (strategyPerf.size > 0) {
      const totalCount = Array.from(strategyPerf.values()).reduce((s, d) => s + d.count, 0);
      const dominantStrategy = Array.from(strategyPerf.entries())
        .sort((a, b) => b[1].count - a[1].count)[0];
      const dominance = dominantStrategy[1].count / totalCount;

      if (dominance > 0.6) {
        patterns.push({
          id: 'strategy-dominance',
          name: 'Strategy Concentration',
          description: `"${dominantStrategy[0]}" accounts for ${(dominance * 100).toFixed(0)}% of all outcomes`,
          frequency: dominantStrategy[1].count,
          avgReward: dominantStrategy[1].avgReward,
          confidence: Math.min(1, totalCount / 20),
          relatedStrategies: [dominantStrategy[0]],
        });
      }
    }

    return patterns;
  }

  // ============ Insights Generation ============

  getInsights(): TrainingInsight[] {
    // Generate fresh insights from current data, merging with stored ones
    this.refreshInsights();
    return [...this.insights];
  }

  private refreshInsights(): void {
    const existingIds = new Set(this.insights.map(i => i.id));

    // Insight: Underperforming strategies should be retired
    const underperformers = this.getUnderperformingStrategies(0.4);
    for (const strategy of underperformers) {
      const id = `retire-${strategy}`;
      if (!existingIds.has(id)) {
        const perf = this.stats.strategyPerformance.get(strategy);
        this.insights.push({
          id,
          type: 'warning',
          title: `Consider retiring "${strategy}"`,
          description: `Strategy "${strategy}" has an average reward of ${perf?.avgReward.toFixed(2) ?? '?'} across ${perf?.count ?? 0} outcomes — well below the 0.4 threshold.`,
          impact: 'medium',
          status: 'pending',
          createdAt: Date.now(),
          relatedStrategy: strategy,
        });
      }
    }

    // Insight: High performer should be used more
    const topStrategies = this.getTopStrategies(1);
    if (topStrategies.length > 0 && topStrategies[0].avgReward > 0.8 && topStrategies[0].count >= 5) {
      const top = topStrategies[0];
      const id = `promote-${top.strategy}`;
      if (!existingIds.has(id)) {
        this.insights.push({
          id,
          type: 'recommendation',
          title: `Increase use of "${top.strategy}"`,
          description: `Strategy "${top.strategy}" achieves ${top.avgReward.toFixed(2)} avg reward across ${top.count} outcomes. Consider making it the default.`,
          impact: 'high',
          status: 'pending',
          createdAt: Date.now(),
          relatedStrategy: top.strategy,
        });
      }
    }

    // Insight: Low sample count warning
    if (this.stats.totalOutcomes > 0 && this.stats.totalOutcomes < this.config.minSamplesForTraining) {
      const id = 'low-sample-count';
      if (!existingIds.has(id)) {
        this.insights.push({
          id,
          type: 'warning',
          title: 'Insufficient training data',
          description: `Only ${this.stats.totalOutcomes} outcomes recorded. Need at least ${this.config.minSamplesForTraining} for reliable training batches.`,
          impact: 'low',
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    }

    // Insight: Reward trend declining
    const trend = this.getRewardTrend();
    if (trend.slope < -0.02 && trend.recent.length >= 5) {
      const id = 'declining-rewards';
      if (!existingIds.has(id)) {
        this.insights.push({
          id,
          type: 'optimization',
          title: 'Reward trend is declining',
          description: `Average reward has been decreasing (slope: ${trend.slope.toFixed(3)}). Consider reviewing recent strategy changes or task complexity.`,
          impact: 'high',
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    }

    // Cap total insights to prevent unbounded growth
    if (this.insights.length > 50) {
      // Remove oldest dismissed/applied insights first
      const resolved = this.insights.filter(i => i.status !== 'pending');
      if (resolved.length > 20) {
        const toRemove = resolved.slice(0, resolved.length - 20);
        const removeIds = new Set(toRemove.map(i => i.id));
        this.insights = this.insights.filter(i => !removeIds.has(i.id));
      }
    }
  }

  applyInsight(insightId: string): boolean {
    const insight = this.insights.find(i => i.id === insightId);
    if (!insight || insight.status !== 'pending') return false;
    insight.status = 'applied';
    this.emit('insight:applied', { insightId, insight });
    return true;
  }

  dismissInsight(insightId: string): boolean {
    const insight = this.insights.find(i => i.id === insightId);
    if (!insight || insight.status !== 'pending') return false;
    insight.status = 'dismissed';
    this.emit('insight:dismissed', { insightId, insight });
    return true;
  }
}

// Export singleton getter
export function getGRPOTrainer(): GRPOTrainer {
  return GRPOTrainer.getInstance();
}
