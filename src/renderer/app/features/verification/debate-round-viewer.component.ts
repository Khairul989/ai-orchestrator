/**
 * Debate Round Viewer Component
 *
 * Displays debate round details:
 * - Round header with type and number
 * - Agent exchanges with arguments/rebuttals
 * - Consensus progress
 * - Agreements/disagreements per round
 */

import {
  Component,
  input,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import type { DebateRound } from '../../../../shared/types/verification.types';
import type { DebateRoundSummary, DebateExchange } from '../../../../shared/types/verification-ui.types';

const ROUND_TYPE_LABELS: Record<string, string> = {
  opening: 'Opening Statements',
  rebuttal: 'Rebuttals',
  closing: 'Closing Arguments',
};

const ROUND_TYPE_ICONS: Record<string, string> = {
  opening: '🎬',
  rebuttal: '⚔️',
  closing: '🏁',
};

@Component({
  selector: 'app-debate-round-viewer',
  standalone: true,
  imports: [CommonModule, ConfidenceMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="round-viewer" [class.expanded]="isExpanded()">
      <!-- Round Header -->
      <div class="round-header" (click)="toggleExpand()">
        <div class="header-left">
          <span class="round-icon">{{ getRoundIcon() }}</span>
          <span class="round-number">Round {{ round().roundNumber }}</span>
          <span class="round-type">{{ getRoundTypeLabel() }}</span>
        </div>

        <div class="header-right">
          <div class="consensus-mini">
            <span class="consensus-label">Consensus:</span>
            <span
              class="consensus-value"
              [class.low]="round().consensusScore < 0.4"
              [class.medium]="round().consensusScore >= 0.4 && round().consensusScore < 0.75"
              [class.high]="round().consensusScore >= 0.75"
            >
              {{ (round().consensusScore * 100).toFixed(0) }}%
            </span>
          </div>

          <span class="expand-icon">{{ isExpanded() ? '▼' : '▶' }}</span>
        </div>
      </div>

      <!-- Expanded Content -->
      @if (isExpanded()) {
        <div class="round-content">
          <!-- Consensus Bar -->
          <div class="consensus-section">
            <app-confidence-meter
              [value]="round().consensusScore"
              [options]="{
                showPercentage: true,
                showLabel: true,
                animate: true,
                size: 'medium'
              }"
            />
          </div>

          <!-- Exchanges -->
          <div class="exchanges-section">
            <h4 class="section-title">Agent Contributions</h4>
            <div class="exchanges-list">
              @for (exchange of round().exchanges; track exchange.id) {
                <div
                  class="exchange-card"
                  [class.position-changed]="exchange.positionChange"
                >
                  <div class="exchange-header">
                    <span class="agent-name">{{ exchange.agentName }}</span>
                    <span class="confidence-badge">
                      {{ (exchange.confidence * 100).toFixed(0) }}% confident
                    </span>
                    @if (exchange.positionChange) {
                      <span class="position-badge">Position Changed</span>
                    }
                  </div>

                  <div class="exchange-argument">
                    <span class="argument-label">Argument:</span>
                    <p class="argument-text">{{ exchange.argument }}</p>
                  </div>

                  @if (exchange.rebuttal) {
                    <div class="exchange-rebuttal">
                      <span class="rebuttal-label">Rebuttal:</span>
                      <p class="rebuttal-text">{{ exchange.rebuttal }}</p>
                    </div>
                  }

                  <div class="exchange-footer">
                    <span class="timestamp">
                      {{ formatTime(exchange.timestamp) }}
                    </span>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Agreements -->
          @if (round().agreements.length > 0) {
            <div class="agreements-section">
              <h4 class="section-title success">
                Agreements This Round
                <span class="count">{{ round().agreements.length }}</span>
              </h4>
              <ul class="points-list">
                @for (agreement of round().agreements; track agreement) {
                  <li class="point-item agreement">{{ agreement }}</li>
                }
              </ul>
            </div>
          }

          <!-- Disagreements -->
          @if (round().disagreements.length > 0) {
            <div class="disagreements-section">
              <h4 class="section-title warning">
                Remaining Disagreements
                <span class="count warning">{{ round().disagreements.length }}</span>
              </h4>
              <ul class="points-list">
                @for (disagreement of round().disagreements; track disagreement) {
                  <li class="point-item disagreement">{{ disagreement }}</li>
                }
              </ul>
            </div>
          }

          <!-- Round Stats -->
          <div class="round-stats">
            <div class="stat-item">
              <span class="stat-label">Exchanges</span>
              <span class="stat-value">{{ round().exchanges.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Duration</span>
              <span class="stat-value">{{ formatDuration(round().duration) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Position Changes</span>
              <span class="stat-value">{{ positionChanges() }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .round-viewer {
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border-color, #374151);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s;
    }

    .round-viewer.expanded {
      border-color: var(--accent-color, #3b82f6);
    }

    /* Header */
    .round-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .round-header:hover {
      background: var(--bg-tertiary, #262626);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .round-icon {
      font-size: 16px;
    }

    .round-number {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .round-type {
      font-size: 12px;
      color: var(--text-muted, #6b7280);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .consensus-mini {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .consensus-label {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }

    .consensus-value {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .consensus-value.low { color: #ef4444; }
    .consensus-value.medium { color: #f59e0b; }
    .consensus-value.high { color: #22c55e; }

    .expand-icon {
      font-size: 10px;
      color: var(--text-muted, #6b7280);
      transition: transform 0.2s;
    }

    /* Content */
    .round-content {
      padding: 0 16px 16px;
      border-top: 1px solid var(--border-color, #374151);
    }

    .consensus-section {
      padding: 16px 0;
      border-bottom: 1px solid var(--border-color, #374151);
    }

    /* Sections */
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 16px 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title.success { color: #22c55e; }
    .section-title.warning { color: #f59e0b; }

    .count {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--accent-color, #3b82f6);
      color: white;
      border-radius: 10px;
    }

    .count.warning {
      background: #f59e0b;
    }

    /* Exchanges */
    .exchanges-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .exchange-card {
      padding: 12px;
      background: var(--bg-tertiary, #262626);
      border-radius: 6px;
      border-left: 3px solid var(--border-color, #374151);
    }

    .exchange-card.position-changed {
      border-left-color: #8b5cf6;
      background: rgba(139, 92, 246, 0.05);
    }

    .exchange-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .agent-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .confidence-badge {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .position-badge {
      font-size: 10px;
      padding: 2px 8px;
      background: rgba(139, 92, 246, 0.2);
      color: #8b5cf6;
      border-radius: 4px;
    }

    .argument-label,
    .rebuttal-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted, #6b7280);
      display: block;
      margin-bottom: 4px;
    }

    .argument-text,
    .rebuttal-text {
      font-size: 13px;
      color: var(--text-primary);
      margin: 0;
      line-height: 1.5;
    }

    .exchange-rebuttal {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border-color, #374151);
    }

    .rebuttal-label {
      color: #f59e0b;
    }

    .exchange-footer {
      margin-top: 8px;
    }

    .timestamp {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }

    /* Points Lists */
    .points-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .point-item {
      padding: 8px 12px;
      background: var(--bg-tertiary, #262626);
      border-radius: 4px;
      margin-bottom: 6px;
      font-size: 13px;
      color: var(--text-primary);
      border-left: 3px solid;
    }

    .point-item.agreement {
      border-left-color: #22c55e;
    }

    .point-item.disagreement {
      border-left-color: #f59e0b;
    }

    /* Stats */
    .round-stats {
      display: flex;
      justify-content: space-around;
      padding: 16px 0 0;
      margin-top: 16px;
      border-top: 1px solid var(--border-color, #374151);
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }

    .stat-value {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }
  `],
})
export class DebateRoundViewerComponent {
  // Inputs
  round = input.required<DebateRoundSummary>();
  initiallyExpanded = input<boolean>(false);

  // Internal state
  isExpanded = signal(false);

  constructor() {
    // Initialize expanded state from input
    if (this.initiallyExpanded()) {
      this.isExpanded.set(true);
    }
  }

  // Computed
  positionChanges = computed(() =>
    this.round().exchanges.filter(e => e.positionChange).length
  );

  // ============================================
  // Methods
  // ============================================

  toggleExpand(): void {
    this.isExpanded.update(v => !v);
  }

  getRoundIcon(): string {
    return ROUND_TYPE_ICONS[this.round().roundType] || '📝';
  }

  getRoundTypeLabel(): string {
    return ROUND_TYPE_LABELS[this.round().roundType] || this.round().roundType;
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}
