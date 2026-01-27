/**
 * Smart Compaction System
 *
 * Advanced context compaction with:
 * - Automatic compaction at 80% context threshold
 * - Tiered summarization (Full → Section → Key decisions)
 * - Tool output clearing for stale results
 * - Preservation of architectural decisions and current task
 * - Compression ratio and information retention metrics
 */

import { EventEmitter } from 'events';
import type {
  ContextQueryResult,
  RLMSession,
  ContextStore,
} from '../../shared/types/rlm.types';
import { SessionCompactor, SessionCompactorConfig, CompactionResult } from './session-compactor';
import { getTokenCounter, TokenCounter } from './token-counter';
import { LLMService, getLLMService } from './llm-service';
import { ErrorRecoveryManager } from '../core/error-recovery';
import { CheckpointManager } from '../session/checkpoint-manager';
import { TransactionType } from '../session/checkpoint-manager';

/**
 * Smart compaction configuration
 */
export interface SmartCompactionConfig extends SessionCompactorConfig {
  /** Start compaction at this percentage of context (default: 80) */
  warningThresholdPercent: number;
  /** Block new inputs at this percentage (default: 95) */
  emergencyThresholdPercent: number;
  /** Keep N most recent files in full detail (default: 5) */
  preserveRecentFiles: number;
  /** Max tokens per summary block (default: 500) */
  summaryMaxTokens: number;
  /** Enable tiered summarization (default: true) */
  enableTieredSummarization: boolean;
  /** Clear tool outputs older than N turns (default: 10) */
  clearToolOutputsAfterTurns: number;
  /** Preserve patterns (regex) for content that should never be compacted */
  preservePatterns: RegExp[];
  /** Enable information retention scoring (default: true) */
  enableRetentionScoring: boolean;
  /** Minimum retention score (0-1) to keep section uncompacted */
  minRetentionScore: number;
}

/**
 * Default smart compaction config
 */
export const DEFAULT_SMART_COMPACTION_CONFIG: SmartCompactionConfig = {
  // Base compactor config
  maxTurns: 30,
  maxTokens: 50000,
  keepRecentTurns: 5,
  summaryTargetTokens: 500,
  autoCompact: true,
  minArchiveBatch: 5,
  // Smart compaction extensions
  warningThresholdPercent: 80,
  emergencyThresholdPercent: 95,
  preserveRecentFiles: 5,
  summaryMaxTokens: 500,
  enableTieredSummarization: true,
  clearToolOutputsAfterTurns: 10,
  preservePatterns: [
    /IMPORTANT:/i,
    /TODO:/i,
    /FIXME:/i,
    /ARCHITECTURE:/i,
    /DECISION:/i,
    /ERROR:/i,
    /BUG:/i,
  ],
  enableRetentionScoring: true,
  minRetentionScore: 0.7,
};

/**
 * Summarization tier
 */
export enum SummarizationTier {
  /** Full content preserved */
  FULL = 'full',
  /** Section-level summaries */
  SECTION = 'section',
  /** Key decisions only */
  KEY_DECISIONS = 'key_decisions',
  /** Minimal (just titles/references) */
  MINIMAL = 'minimal',
}

/**
 * Content classification for compaction decisions
 */
export interface ContentClassification {
  /** Unique ID */
  id: string;
  /** Content type */
  type: 'message' | 'tool_output' | 'file_content' | 'code' | 'decision' | 'error';
  /** Importance score (0-1) */
  importanceScore: number;
  /** Recency score (0-1, higher = more recent) */
  recencyScore: number;
  /** Reference count (how often referenced) */
  referenceCount: number;
  /** Information retention score (0-1) */
  retentionScore: number;
  /** Recommended tier */
  recommendedTier: SummarizationTier;
  /** Should preserve (matches preserve pattern) */
  shouldPreserve: boolean;
  /** Token count */
  tokens: number;
}

/**
 * Compaction metrics
 */
export interface CompactionMetrics {
  /** Compression ratio (original / compressed) */
  compressionRatio: number;
  /** Information retention score (0-1) */
  informationRetention: number;
  /** Tokens before compaction */
  tokensBefore: number;
  /** Tokens after compaction */
  tokensAfter: number;
  /** Tokens saved */
  tokensSaved: number;
  /** Percentage of context used */
  contextUsagePercent: number;
  /** Number of items compacted */
  itemsCompacted: number;
  /** Number of items preserved */
  itemsPreserved: number;
  /** Tier distribution */
  tierDistribution: Record<SummarizationTier, number>;
  /** Time taken (ms) */
  durationMs: number;
}

/**
 * Compaction event
 */
export type SmartCompactionEvent =
  | { type: 'threshold_warning'; percent: number; sessionId: string }
  | { type: 'threshold_emergency'; percent: number; sessionId: string }
  | { type: 'compaction_started'; sessionId: string; reason: string }
  | { type: 'compaction_completed'; sessionId: string; metrics: CompactionMetrics }
  | { type: 'compaction_failed'; sessionId: string; error: Error }
  | { type: 'tool_outputs_cleared'; sessionId: string; count: number; tokensSaved: number }
  | { type: 'tiered_summarization'; sessionId: string; tier: SummarizationTier; items: number };

/**
 * Smart Compaction Manager
 *
 * Provides intelligent, threshold-based context compaction.
 */
export class SmartCompactionManager extends EventEmitter {
  private static instance: SmartCompactionManager | null = null;

  private config: SmartCompactionConfig;
  private baseCompactor: SessionCompactor;
  private tokenCounter: TokenCounter;
  private llmService: LLMService | null = null;
  private errorRecovery: ErrorRecoveryManager;
  private checkpointManager: CheckpointManager;
  private sessionMetrics: Map<string, CompactionMetrics[]> = new Map();
  private lastCompactionTime: Map<string, number> = new Map();

  private constructor() {
    super();
    this.config = { ...DEFAULT_SMART_COMPACTION_CONFIG };
    this.baseCompactor = new SessionCompactor(this.config);
    this.tokenCounter = getTokenCounter();
    this.errorRecovery = ErrorRecoveryManager.getInstance();
    this.checkpointManager = CheckpointManager.getInstance();

    this.initialize();
  }

  static getInstance(): SmartCompactionManager {
    if (!SmartCompactionManager.instance) {
      SmartCompactionManager.instance = new SmartCompactionManager();
    }
    return SmartCompactionManager.instance;
  }

  /**
   * Initialize the manager
   */
  private initialize(): void {
    try {
      this.llmService = getLLMService();
      this.baseCompactor.initialize();
    } catch (error) {
      console.warn('[SmartCompaction] LLM service not available:', error);
    }
  }

  /**
   * Configure the compaction manager
   */
  configure(config: Partial<SmartCompactionConfig>): void {
    this.config = { ...this.config, ...config };
    this.baseCompactor.configure(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SmartCompactionConfig {
    return { ...this.config };
  }

  /**
   * Check context usage and trigger compaction if needed
   */
  async checkAndCompact(
    session: RLMSession,
    store: ContextStore,
    contextLimit: number
  ): Promise<CompactionMetrics | null> {
    const currentTokens = session.totalRootTokens + session.totalSubQueryTokens;
    const usagePercent = (currentTokens / contextLimit) * 100;

    // Check thresholds
    if (usagePercent >= this.config.emergencyThresholdPercent) {
      this.emitEvent({
        type: 'threshold_emergency',
        percent: usagePercent,
        sessionId: session.id,
      });

      // Emergency compaction - aggressive
      return this.performCompaction(session, store, 'emergency');
    }

    if (usagePercent >= this.config.warningThresholdPercent) {
      this.emitEvent({
        type: 'threshold_warning',
        percent: usagePercent,
        sessionId: session.id,
      });

      // Standard compaction
      return this.performCompaction(session, store, 'threshold');
    }

    // Check for stale tool outputs
    await this.clearStaleToolOutputs(session);

    return null;
  }

  /**
   * Perform smart compaction
   */
  async performCompaction(
    session: RLMSession,
    store: ContextStore,
    reason: string
  ): Promise<CompactionMetrics> {
    const startTime = Date.now();
    const tokensBefore = session.totalRootTokens + session.totalSubQueryTokens;

    // Create checkpoint before compaction
    const transactionId = this.checkpointManager.beginTransaction(
      session.id,
      TransactionType.CONTEXT_COMPACTION,
      `Smart compaction: ${reason}`,
      { tokensBefore, queries: session.queries.length }
    );

    this.emitEvent({
      type: 'compaction_started',
      sessionId: session.id,
      reason,
    });

    try {
      // Classify all content
      const classifications = this.classifyContent(session);

      // Determine what to compact based on tier
      const tierDistribution: Record<SummarizationTier, number> = {
        [SummarizationTier.FULL]: 0,
        [SummarizationTier.SECTION]: 0,
        [SummarizationTier.KEY_DECISIONS]: 0,
        [SummarizationTier.MINIMAL]: 0,
      };

      let itemsCompacted = 0;
      let itemsPreserved = 0;
      let informationRetention = 0;

      if (this.config.enableTieredSummarization) {
        // Apply tiered summarization
        for (const classification of classifications) {
          tierDistribution[classification.recommendedTier]++;

          if (classification.shouldPreserve || classification.retentionScore >= this.config.minRetentionScore) {
            itemsPreserved++;
            informationRetention += classification.retentionScore;
          } else {
            itemsCompacted++;
            // Apply summarization based on tier
            await this.applySummarizationTier(session, classification);
          }
        }

        if (classifications.length > 0) {
          informationRetention /= classifications.length;
        }
      } else {
        // Use base compactor
        const result = await this.baseCompactor.compact(session);
        if (result.success) {
          itemsCompacted = result.turnsArchived;
          informationRetention = 0.8; // Estimated
        }
      }

      const tokensAfter = session.totalRootTokens + session.totalSubQueryTokens;
      const durationMs = Date.now() - startTime;

      const metrics: CompactionMetrics = {
        compressionRatio: tokensBefore / Math.max(tokensAfter, 1),
        informationRetention,
        tokensBefore,
        tokensAfter,
        tokensSaved: tokensBefore - tokensAfter,
        contextUsagePercent: 0, // Will be calculated by caller with context limit
        itemsCompacted,
        itemsPreserved,
        tierDistribution,
        durationMs,
      };

      // Store metrics
      const sessionMetrics = this.sessionMetrics.get(session.id) || [];
      sessionMetrics.push(metrics);
      this.sessionMetrics.set(session.id, sessionMetrics.slice(-10)); // Keep last 10

      this.lastCompactionTime.set(session.id, Date.now());

      // Commit transaction
      this.checkpointManager.commitTransaction(transactionId, {
        metrics,
        tokensAfter,
      });

      this.emitEvent({
        type: 'compaction_completed',
        sessionId: session.id,
        metrics,
      });

      return metrics;
    } catch (error) {
      // Rollback transaction
      this.checkpointManager.rollbackTransaction(transactionId, error as Error);

      this.emitEvent({
        type: 'compaction_failed',
        sessionId: session.id,
        error: error as Error,
      });

      throw error;
    }
  }

  /**
   * Classify content for compaction decisions
   */
  private classifyContent(session: RLMSession): ContentClassification[] {
    const classifications: ContentClassification[] = [];
    const totalQueries = session.queries.length;

    for (let i = 0; i < totalQueries; i++) {
      const query = session.queries[i]!;
      const recency = i / totalQueries; // 0 = oldest, 1 = newest

      // Determine content type
      let type: ContentClassification['type'] = 'message';
      if (query.query.type === 'grep' || query.query.type === 'get_section') {
        type = 'file_content';
      } else if (query.result.includes('Tool output:') || query.result.includes('```')) {
        type = 'tool_output';
      } else if (query.result.toLowerCase().includes('decision') || query.result.toLowerCase().includes('architecture')) {
        type = 'decision';
      } else if (query.result.toLowerCase().includes('error') || query.result.toLowerCase().includes('failed')) {
        type = 'error';
      }

      // Calculate importance based on content
      let importanceScore = 0.5;
      if (type === 'decision' || type === 'error') {
        importanceScore = 0.9;
      } else if (type === 'file_content') {
        importanceScore = 0.6;
      } else if (type === 'tool_output') {
        importanceScore = 0.4;
      }

      // Check preserve patterns
      const shouldPreserve = this.config.preservePatterns.some((pattern) =>
        pattern.test(query.result)
      );

      if (shouldPreserve) {
        importanceScore = 1.0;
      }

      // Calculate retention score
      const retentionScore = (importanceScore * 0.5) + (recency * 0.5);

      // Determine recommended tier
      let recommendedTier: SummarizationTier;
      if (recency > 0.8 || shouldPreserve) {
        recommendedTier = SummarizationTier.FULL;
      } else if (retentionScore > 0.6) {
        recommendedTier = SummarizationTier.SECTION;
      } else if (retentionScore > 0.3) {
        recommendedTier = SummarizationTier.KEY_DECISIONS;
      } else {
        recommendedTier = SummarizationTier.MINIMAL;
      }

      classifications.push({
        id: `q-${i}`,
        type,
        importanceScore,
        recencyScore: recency,
        referenceCount: 0, // Could track cross-references
        retentionScore,
        recommendedTier,
        shouldPreserve,
        tokens: query.tokensUsed,
      });
    }

    return classifications;
  }

  /**
   * Apply summarization based on tier
   */
  private async applySummarizationTier(
    session: RLMSession,
    classification: ContentClassification
  ): Promise<void> {
    const queryIndex = parseInt(classification.id.split('-')[1]!);
    const query = session.queries[queryIndex];
    if (!query) return;

    switch (classification.recommendedTier) {
      case SummarizationTier.SECTION:
        // Summarize to section level
        if (this.llmService && query.tokensUsed > this.config.summaryMaxTokens) {
          const summary = await this.llmService.summarize({
            requestId: `tier-section-${Date.now()}`,
            content: query.result,
            targetTokens: Math.min(this.config.summaryMaxTokens, query.tokensUsed / 2),
            preserveKeyPoints: true,
          });
          query.result = `[Section Summary]\n${summary}`;
          query.tokensUsed = this.tokenCounter.countTokens(query.result);
        }
        break;

      case SummarizationTier.KEY_DECISIONS:
        // Extract only key decisions
        if (this.llmService) {
          const decisions = await this.llmService.summarize({
            requestId: `tier-decisions-${Date.now()}`,
            content: `Extract only the key decisions, important changes, or critical information from:\n${query.result}`,
            targetTokens: Math.min(200, query.tokensUsed / 4),
            preserveKeyPoints: true,
          });
          query.result = `[Key Points]\n${decisions}`;
          query.tokensUsed = this.tokenCounter.countTokens(query.result);
        }
        break;

      case SummarizationTier.MINIMAL:
        // Minimal reference only
        const preview = query.result.slice(0, 100).replace(/\n/g, ' ');
        query.result = `[Archived: ${preview}...]`;
        query.tokensUsed = this.tokenCounter.countTokens(query.result);
        break;

      case SummarizationTier.FULL:
      default:
        // Keep as is
        break;
    }

    this.emitEvent({
      type: 'tiered_summarization',
      sessionId: session.id,
      tier: classification.recommendedTier,
      items: 1,
    });
  }

  /**
   * Clear stale tool outputs
   */
  async clearStaleToolOutputs(session: RLMSession): Promise<void> {
    const totalQueries = session.queries.length;
    const threshold = totalQueries - this.config.clearToolOutputsAfterTurns;

    if (threshold <= 0) return;

    let clearedCount = 0;
    let tokensSaved = 0;

    for (let i = 0; i < threshold; i++) {
      const query = session.queries[i];
      if (!query) continue;

      // Check if this is a tool output
      if (
        query.query.type === 'grep' ||
        (query.result.includes('```') && query.tokensUsed > 500)
      ) {
        const originalTokens = query.tokensUsed;

        // Replace with minimal reference
        const preview = query.result.slice(0, 100).replace(/\n/g, ' ');
        query.result = `[Tool output archived: ${preview}...]`;
        query.tokensUsed = this.tokenCounter.countTokens(query.result);

        tokensSaved += originalTokens - query.tokensUsed;
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      session.totalRootTokens -= tokensSaved;

      this.emitEvent({
        type: 'tool_outputs_cleared',
        sessionId: session.id,
        count: clearedCount,
        tokensSaved,
      });
    }
  }

  /**
   * Get compaction metrics for a session
   */
  getSessionMetrics(sessionId: string): CompactionMetrics[] {
    return this.sessionMetrics.get(sessionId) || [];
  }

  /**
   * Get last compaction time
   */
  getLastCompactionTime(sessionId: string): number | undefined {
    return this.lastCompactionTime.get(sessionId);
  }

  /**
   * Get aggregate metrics across all sessions
   */
  getAggregateMetrics(): {
    totalCompactions: number;
    totalTokensSaved: number;
    averageCompressionRatio: number;
    averageRetention: number;
  } {
    let totalCompactions = 0;
    let totalTokensSaved = 0;
    let totalCompressionRatio = 0;
    let totalRetention = 0;

    for (const metrics of this.sessionMetrics.values()) {
      for (const m of metrics) {
        totalCompactions++;
        totalTokensSaved += m.tokensSaved;
        totalCompressionRatio += m.compressionRatio;
        totalRetention += m.informationRetention;
      }
    }

    return {
      totalCompactions,
      totalTokensSaved,
      averageCompressionRatio: totalCompactions > 0 ? totalCompressionRatio / totalCompactions : 0,
      averageRetention: totalCompactions > 0 ? totalRetention / totalCompactions : 0,
    };
  }

  /**
   * Clear session data
   */
  clearSession(sessionId: string): void {
    this.sessionMetrics.delete(sessionId);
    this.lastCompactionTime.delete(sessionId);
    this.baseCompactor.clearSessionCache(sessionId);
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: SmartCompactionEvent): void {
    this.emit(event.type, event);
    this.emit('compaction_event', event);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.sessionMetrics.clear();
    this.lastCompactionTime.clear();
    this.removeAllListeners();
    SmartCompactionManager.instance = null;
  }
}

export default SmartCompactionManager;
