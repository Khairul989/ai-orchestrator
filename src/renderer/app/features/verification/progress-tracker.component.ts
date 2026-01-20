/**
 * Progress Tracker Component
 *
 * Displays multi-agent progress:
 * - Overall progress bar
 * - Per-agent progress items
 * - Status indicators
 * - Token/time stats
 */

import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CliStatusIndicatorComponent } from './cli-status-indicator.component';
import type { ProgressItem, ProgressTrackerConfig } from '../../../../shared/types/verification-ui.types';

@Component({
  selector: 'app-progress-tracker',
  standalone: true,
  imports: [CommonModule, CliStatusIndicatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress-tracker">
      <!-- Overall Progress -->
      <div class="overall-section">
        <div class="overall-header">
          <span class="overall-label">Overall Progress</span>
          <span class="overall-percent">{{ overallProgress().toFixed(0) }}%</span>
        </div>
        <div class="overall-bar">
          <div
            class="overall-fill"
            [style.width.%]="overallProgress()"
            [class.complete]="overallProgress() >= 100"
          ></div>
        </div>
        <div class="overall-stats">
          <span class="stat">{{ completedCount() }}/{{ items().length }} agents</span>
          @if (totalTokens() > 0) {
            <span class="stat">{{ formatTokens(totalTokens()) }} tokens</span>
          }
          @if (totalElapsed() > 0) {
            <span class="stat">{{ formatElapsed(totalElapsed()) }}</span>
          }
        </div>
      </div>

      <!-- Agent Progress Items -->
      <div class="agents-section">
        @for (item of sortedItems(); track item.id) {
          <div
            class="agent-item"
            [class.running]="item.status === 'running'"
            [class.complete]="item.status === 'complete'"
            [class.error]="item.status === 'error'"
            [class.collapsed]="config().collapseCompleted && item.status === 'complete'"
          >
            <div class="agent-header">
              <app-cli-status-indicator
                [status]="getIndicatorStatus(item)"
                [showLabel]="false"
                [compact]="true"
              />
              <span class="agent-name">{{ item.name }}</span>
              <span class="agent-percent">{{ item.progress.toFixed(0) }}%</span>
            </div>

            @if (item.status === 'running' || !config().collapseCompleted) {
              <div class="agent-bar-container">
                <div
                  class="agent-bar"
                  [style.width.%]="item.progress"
                  [class.running]="item.status === 'running'"
                  [class.complete]="item.status === 'complete'"
                  [class.error]="item.status === 'error'"
                ></div>
              </div>

              @if (config().showActivity && item.activity) {
                <div class="agent-activity">{{ item.activity }}</div>
              }

              <div class="agent-stats">
                @if (config().showTokens && item.tokens) {
                  <span class="stat">{{ formatTokens(item.tokens) }} tokens</span>
                }
                @if (config().showTime && item.elapsed) {
                  <span class="stat">{{ formatElapsed(item.elapsed) }}</span>
                }
                @if (item.error) {
                  <span class="stat error">{{ item.error }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .progress-tracker {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Overall Section */
    .overall-section {
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    .overall-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .overall-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .overall-percent {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-color, #3b82f6);
      font-variant-numeric: tabular-nums;
    }

    .overall-bar {
      height: 8px;
      background: var(--bg-tertiary, #262626);
      border-radius: 4px;
      overflow: hidden;
    }

    .overall-fill {
      height: 100%;
      background: var(--accent-color, #3b82f6);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .overall-fill.complete {
      background: #22c55e;
    }

    .overall-stats {
      display: flex;
      gap: 16px;
      margin-top: 8px;
    }

    .stat {
      font-size: 12px;
      color: var(--text-muted, #6b7280);
    }

    .stat.error {
      color: #ef4444;
    }

    /* Agents Section */
    .agents-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .agent-item {
      padding: 12px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 6px;
      border: 1px solid var(--border-color, #374151);
      transition: all 0.2s;
    }

    .agent-item.running {
      border-color: var(--accent-color, #3b82f6);
    }

    .agent-item.complete {
      border-color: #22c55e;
    }

    .agent-item.error {
      border-color: #ef4444;
    }

    .agent-item.collapsed {
      padding: 8px 12px;
    }

    .agent-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .agent-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      flex: 1;
    }

    .agent-percent {
      font-size: 12px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
    }

    .agent-bar-container {
      height: 4px;
      background: var(--bg-tertiary, #262626);
      border-radius: 2px;
      margin: 8px 0;
      overflow: hidden;
    }

    .agent-bar {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .agent-bar.running {
      background: var(--accent-color, #3b82f6);
      animation: pulse 1.5s ease-in-out infinite;
    }

    .agent-bar.complete {
      background: #22c55e;
    }

    .agent-bar.error {
      background: #ef4444;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .agent-activity {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .agent-stats {
      display: flex;
      gap: 12px;
    }
  `],
})
export class ProgressTrackerComponent {
  // Inputs
  items = input.required<ProgressItem[]>();
  config = input<ProgressTrackerConfig>({
    showTokens: true,
    showTime: true,
    showActivity: true,
    collapseCompleted: false,
  });

  // Computed
  sortedItems = computed(() => {
    const items = [...this.items()];
    // Sort: running first, then pending, then complete/error
    return items.sort((a, b) => {
      const order = { running: 0, pending: 1, complete: 2, error: 3, cancelled: 4 };
      return (order[a.status] || 4) - (order[b.status] || 4);
    });
  });

  completedCount = computed(() =>
    this.items().filter(i => i.status === 'complete').length
  );

  overallProgress = computed(() => {
    const items = this.items();
    if (items.length === 0) return 0;
    const total = items.reduce((sum, i) => sum + i.progress, 0);
    return total / items.length;
  });

  totalTokens = computed(() =>
    this.items().reduce((sum, i) => sum + (i.tokens || 0), 0)
  );

  totalElapsed = computed(() => {
    const items = this.items();
    if (items.length === 0) return 0;
    return Math.max(...items.map(i => i.elapsed || 0));
  });

  // ============================================
  // Methods
  // ============================================

  getIndicatorStatus(item: ProgressItem): 'available' | 'checking' | 'error' | 'not-found' {
    switch (item.status) {
      case 'running': return 'checking';
      case 'complete': return 'available';
      case 'error': return 'error';
      default: return 'not-found';
    }
  }

  formatTokens(tokens: number): string {
    if (tokens < 1000) return tokens.toString();
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }

  formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}
