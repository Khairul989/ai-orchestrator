/**
 * Agent Response Stream Component
 *
 * Displays a single agent's streaming response:
 * - Agent header with status
 * - Streaming text content
 * - Token count
 * - Progress indicator
 */

import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamingTextComponent } from '../../shared/components/streaming-text/streaming-text.component';
import { TokenCounterComponent } from '../../shared/components/token-counter/token-counter.component';
import { CliStatusIndicatorComponent } from './cli-status-indicator.component';
import type { AgentStreamState, StreamStatus } from './services/agent-stream.service';

const STATUS_LABELS: Record<StreamStatus, string> = {
  'idle': 'Waiting',
  'connecting': 'Connecting...',
  'streaming': 'Generating...',
  'paused': 'Paused',
  'complete': 'Complete',
  'error': 'Error',
};

@Component({
  selector: 'app-agent-response-stream',
  standalone: true,
  imports: [
    CommonModule,
    StreamingTextComponent,
    TokenCounterComponent,
    CliStatusIndicatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="agent-response"
      [class.streaming]="isStreaming()"
      [class.complete]="isComplete()"
      [class.error]="isError()"
      [class.expanded]="expanded()"
    >
      <!-- Header -->
      <div class="response-header" (click)="toggleExpanded()">
        <div class="header-left">
          <app-cli-status-indicator
            [status]="statusForIndicator()"
            [showLabel]="false"
            [compact]="true"
          />
          <span class="agent-name">{{ stream().agentName }}</span>
          <span class="status-text">{{ statusLabel() }}</span>
        </div>

        <div class="header-right">
          @if (stream().tokens > 0) {
            <app-token-counter
              [totalTokens]="stream().tokens"
              [showBreakdown]="false"
              [showCost]="false"
              [compact]="true"
              icon="📝"
            />
          }

          @if (elapsed()) {
            <span class="elapsed-time">{{ formatElapsed(elapsed()!) }}</span>
          }

          <span class="expand-icon">{{ expanded() ? '▼' : '▶' }}</span>
        </div>
      </div>

      <!-- Content -->
      @if (expanded()) {
        <div class="response-content">
          @if (stream().content || stream().status === 'streaming') {
            <app-streaming-text
              [text]="stream().content"
              [isStreaming]="stream().isReceiving"
              [options]="{
                enableMarkdown: true,
                showCursor: stream().isReceiving,
                autoScroll: true
              }"
            />
          } @else if (stream().status === 'idle') {
            <div class="placeholder">
              Waiting for response...
            </div>
          } @else if (stream().error) {
            <div class="error-message">
              {{ stream().error }}
            </div>
          }
        </div>

        <!-- Progress Bar -->
        @if (isStreaming()) {
          <div class="progress-bar">
            <div class="progress-fill indeterminate"></div>
          </div>
        }

        <!-- Footer (when complete) -->
        @if (isComplete()) {
          <div class="response-footer">
            <span class="footer-stat">
              {{ stream().tokens }} tokens
            </span>
            @if (stream().completedAt && stream().startedAt) {
              <span class="footer-stat">
                {{ formatElapsed(stream().completedAt! - stream().startedAt!) }}
              </span>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .agent-response {
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border-color, #374151);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s;
    }

    .agent-response.streaming {
      border-color: var(--accent-color, #3b82f6);
    }

    .agent-response.complete {
      border-color: #22c55e;
    }

    .agent-response.error {
      border-color: #ef4444;
    }

    /* Header */
    .response-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .response-header:hover {
      background: var(--bg-tertiary, #262626);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .agent-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .status-text {
      font-size: 12px;
      color: var(--text-muted, #6b7280);
    }

    .streaming .status-text {
      color: var(--accent-color, #3b82f6);
    }

    .complete .status-text {
      color: #22c55e;
    }

    .error .status-text {
      color: #ef4444;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .elapsed-time {
      font-size: 12px;
      color: var(--text-muted, #6b7280);
      font-variant-numeric: tabular-nums;
    }

    .expand-icon {
      font-size: 10px;
      color: var(--text-muted, #6b7280);
      transition: transform 0.2s;
    }

    /* Content */
    .response-content {
      padding: 0 16px 16px;
      max-height: 300px;
      overflow-y: auto;
    }

    .placeholder {
      padding: 24px;
      text-align: center;
      color: var(--text-muted, #6b7280);
      font-size: 13px;
    }

    .error-message {
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 6px;
      color: #ef4444;
      font-size: 13px;
    }

    /* Progress Bar */
    .progress-bar {
      height: 2px;
      background: var(--bg-tertiary, #262626);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent-color, #3b82f6);
    }

    .progress-fill.indeterminate {
      width: 30%;
      animation: slide 1.5s infinite;
    }

    @keyframes slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }

    /* Footer */
    .response-footer {
      display: flex;
      gap: 16px;
      padding: 10px 16px;
      background: var(--bg-tertiary, #262626);
      border-top: 1px solid var(--border-color, #374151);
    }

    .footer-stat {
      font-size: 12px;
      color: var(--text-muted, #6b7280);
    }

    /* Scrollbar */
    .response-content::-webkit-scrollbar {
      width: 6px;
    }

    .response-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .response-content::-webkit-scrollbar-thumb {
      background: var(--border-color, #374151);
      border-radius: 3px;
    }
  `],
})
export class AgentResponseStreamComponent {
  // Inputs
  stream = input.required<AgentStreamState>();
  expanded = input<boolean>(true);

  // Computed
  isStreaming = computed(() =>
    this.stream().status === 'streaming' || this.stream().status === 'connecting'
  );

  isComplete = computed(() => this.stream().status === 'complete');
  isError = computed(() => this.stream().status === 'error');

  statusLabel = computed(() => STATUS_LABELS[this.stream().status]);

  statusForIndicator = computed(() => {
    const status = this.stream().status;
    switch (status) {
      case 'streaming':
      case 'connecting':
        return 'checking' as const;
      case 'complete':
        return 'available' as const;
      case 'error':
        return 'error' as const;
      default:
        return 'not-found' as const;
    }
  });

  elapsed = computed(() => {
    const s = this.stream();
    if (!s.startedAt) return null;
    if (s.completedAt) return s.completedAt - s.startedAt;
    if (s.status === 'streaming') return Date.now() - s.startedAt;
    return null;
  });

  // ============================================
  // Methods
  // ============================================

  toggleExpanded(): void {
    // This would need to be an output or use a local signal
  }

  formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}
