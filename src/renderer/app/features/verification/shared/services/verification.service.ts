/**
 * Verification Service
 *
 * Handles verification operations including:
 * - Starting/stopping verification sessions
 * - Calculating costs
 * - Managing session state
 * - Interacting with the backend via IPC
 */

import { Injectable, inject, signal } from '@angular/core';
import { ElectronIpcService } from '../../../../core/services/ipc';
import { VerificationStore, type VerificationSession } from '../../../../core/state/verification.store';
import type {
  CostBreakdown,
  SessionCostSummary,
  TimelineEvent,
  VerificationLauncherForm,
  LauncherValidation,
} from '../../../../../../shared/types/verification-ui.types';
import type { VerificationResult } from '../../../../../../shared/types/verification.types';

// Cost rates per 1M tokens (approximate)
const COST_RATES: Record<string, { input: number; output: number }> = {
  'claude': { input: 3.0, output: 15.0 },
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'gemini': { input: 0.5, output: 1.5 },
  'gemini-pro': { input: 0.5, output: 1.5 },
  'codex': { input: 0.0, output: 0.0 }, // Local/free
  'ollama': { input: 0.0, output: 0.0 }, // Local/free
  'default': { input: 1.0, output: 3.0 },
};

@Injectable({ providedIn: 'root' })
export class VerificationService {
  private ipc = inject(ElectronIpcService);
  private store = inject(VerificationStore);

  // UI State signals
  readonly isStarting = signal(false);
  readonly isCancelling = signal(false);
  readonly lastError = signal<string | null>(null);

  /**
   * Start a new verification session
   */
  async startVerification(form: VerificationLauncherForm): Promise<string> {
    // Validate form
    const validation = this.validateForm(form);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).filter(Boolean).join(', ');
      this.lastError.set(errorMsg);
      throw new Error(errorMsg);
    }

    this.isStarting.set(true);
    this.lastError.set(null);

    try {
      // Update store config with form values
      this.store.setDefaultConfig({
        cliAgents: form.selectedAgents,
        personalities: form.personalities,
        synthesisStrategy: form.synthesisStrategy,
        confidenceThreshold: form.confidenceThreshold,
        maxDebateRounds: form.maxDebateRounds,
        agentCount: form.selectedAgents.length,
      });

      // Start verification via store
      const sessionId = await this.store.startVerification(form.prompt, form.context);
      return sessionId;
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.lastError.set(errorMsg);
      throw error;
    } finally {
      this.isStarting.set(false);
    }
  }

  /**
   * Cancel the current verification session
   */
  async cancelVerification(sessionId?: string): Promise<void> {
    this.isCancelling.set(true);

    try {
      if (sessionId) {
        await this.ipc.getApi()?.verificationCancel({ id: sessionId });
      } else {
        await this.store.cancelVerification();
      }
    } finally {
      this.isCancelling.set(false);
    }
  }

  /**
   * Validate the launcher form
   */
  validateForm(form: VerificationLauncherForm): LauncherValidation {
    const errors: LauncherValidation['errors'] = {};
    const warnings: string[] = [];

    // Validate prompt
    if (!form.prompt?.trim()) {
      errors.prompt = 'Prompt is required';
    } else if (form.prompt.length < 10) {
      errors.prompt = 'Prompt is too short (min 10 characters)';
    } else if (form.prompt.length > 50000) {
      errors.prompt = 'Prompt is too long (max 50,000 characters)';
    }

    // Validate agents
    if (!form.selectedAgents?.length) {
      errors.agents = 'At least one agent must be selected';
    } else if (form.selectedAgents.length < 2) {
      warnings.push('Using only one agent reduces verification effectiveness');
    } else if (form.selectedAgents.length > 5) {
      warnings.push('More than 5 agents may significantly increase costs and time');
    }

    // Validate personalities
    if (form.personalities?.length && form.personalities.length > form.selectedAgents?.length) {
      warnings.push('More personalities than agents selected - some will be ignored');
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate cost breakdown for a session
   */
  calculateSessionCost(session: VerificationSession): SessionCostSummary {
    const breakdown: CostBreakdown[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    // Calculate per-agent costs
    const agentProgress = Array.from(session.agentProgress.values());

    for (const agent of agentProgress) {
      const rates = this.getCostRates(agent.name);
      const inputTokens = Math.floor(agent.tokens * 0.3); // Estimate 30% input
      const outputTokens = agent.tokens - inputTokens;

      const inputCost = (inputTokens / 1_000_000) * rates.input;
      const outputCost = (outputTokens / 1_000_000) * rates.output;
      const agentCost = inputCost + outputCost;

      breakdown.push({
        agentId: agent.agentId,
        agentName: agent.name,
        inputTokens,
        outputTokens,
        totalCost: agentCost,
        inputCostRate: rates.input,
        outputCostRate: rates.output,
      });

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCost += agentCost;
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      breakdown,
      calculatedAt: Date.now(),
    };
  }

  /**
   * Calculate cost for a verification result
   */
  calculateResultCost(result: VerificationResult): SessionCostSummary {
    const breakdown: CostBreakdown[] = [];

    for (const response of result.responses) {
      const rates = this.getCostRates(response.model);
      const inputTokens = Math.floor(response.tokens * 0.3);
      const outputTokens = response.tokens - inputTokens;

      breakdown.push({
        agentId: response.agentId,
        agentName: response.model,
        inputTokens,
        outputTokens,
        totalCost: response.cost,
        inputCostRate: rates.input,
        outputCostRate: rates.output,
        model: response.model,
      });
    }

    return {
      totalInputTokens: breakdown.reduce((sum, b) => sum + b.inputTokens, 0),
      totalOutputTokens: breakdown.reduce((sum, b) => sum + b.outputTokens, 0),
      totalCost: result.totalCost,
      breakdown,
      calculatedAt: Date.now(),
    };
  }

  /**
   * Generate timeline events from session
   */
  generateTimeline(session: VerificationSession): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // Session start
    events.push({
      id: `${session.id}-start`,
      timestamp: session.startedAt,
      type: 'start',
      label: 'Verification Started',
      description: `Started verification with ${session.config.agentCount} agents`,
    });

    // Agent events
    const agentProgress = Array.from(session.agentProgress.values());
    for (const agent of agentProgress) {
      events.push({
        id: `${agent.agentId}-start`,
        timestamp: session.startedAt + 100, // Approximate
        type: 'agent-start',
        label: `${agent.name} Started`,
        relatedId: agent.agentId,
      });

      if (agent.status === 'complete' || agent.status === 'error') {
        events.push({
          id: `${agent.agentId}-complete`,
          timestamp: session.completedAt || Date.now(),
          type: agent.status === 'error' ? 'error' : 'agent-complete',
          label: `${agent.name} ${agent.status === 'error' ? 'Failed' : 'Completed'}`,
          relatedId: agent.agentId,
        });
      }
    }

    // Round events
    if (session.currentRound) {
      for (let i = 1; i <= session.currentRound; i++) {
        events.push({
          id: `round-${i}`,
          timestamp: session.startedAt + (i * 30000), // Approximate
          type: i === session.currentRound ? 'round-complete' : 'round-start',
          label: `Round ${i}`,
        });
      }
    }

    // Session complete
    if (session.status === 'complete' && session.completedAt) {
      events.push({
        id: `${session.id}-complete`,
        timestamp: session.completedAt,
        type: 'complete',
        label: 'Verification Completed',
        description: `Final consensus: ${Math.round((session.consensusScore || 0) * 100)}%`,
      });
    }

    // Sort by timestamp
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get cost rates for a model
   */
  private getCostRates(model: string): { input: number; output: number } {
    const normalizedModel = model.toLowerCase();

    for (const [key, rates] of Object.entries(COST_RATES)) {
      if (normalizedModel.includes(key)) {
        return rates;
      }
    }

    return COST_RATES['default'];
  }

  /**
   * Format cost for display
   */
  formatCost(cost: number): string {
    if (cost === 0) return 'Free';
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
  }

  /**
   * Format token count for display
   */
  formatTokens(tokens: number): string {
    if (tokens < 1000) return `${tokens}`;
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): VerificationSession | undefined {
    return this.store.getSession(sessionId);
  }

  /**
   * Get current session
   */
  getCurrentSession(): VerificationSession | null {
    return this.store.currentSession();
  }

  /**
   * Check if verification is running
   */
  isRunning(): boolean {
    return this.store.isRunning();
  }
}
