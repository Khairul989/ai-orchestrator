/**
 * Synthesis Viewer Component
 *
 * Displays the final synthesized verification result:
 * - Main synthesized response
 * - Source attribution
 * - Confidence scores
 * - Agreements and disagreements
 * - Export options
 */

import {
  Component,
  input,
  output,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamingTextComponent } from '../../shared/components/streaming-text/streaming-text.component';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import { CostEstimatorComponent } from '../../shared/components/cost-estimator/cost-estimator.component';
import type { VerificationResult, AgreementPoint, DisagreementPoint, UniqueInsight } from '../../../../shared/types/verification.types';
import type { SessionCostSummary, SynthesisDisplayOptions, VerificationExportFormat } from '../../../../shared/types/verification-ui.types';

@Component({
  selector: 'app-synthesis-viewer',
  standalone: true,
  imports: [
    CommonModule,
    StreamingTextComponent,
    ConfidenceMeterComponent,
    CostEstimatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="synthesis-viewer">
      <!-- Header -->
      <div class="viewer-header">
        <div class="header-left">
          <h2 class="viewer-title">Verification Result</h2>
          <span class="synthesis-method">{{ methodLabel() }}</span>
        </div>

        <div class="header-right">
          @if (options().showExport) {
            <div class="export-dropdown">
              <button class="export-btn" (click)="toggleExportMenu()">
                📤 Export
              </button>
              @if (showExportMenu()) {
                <div class="export-menu">
                  <button (click)="handleExport('markdown')">Markdown</button>
                  <button (click)="handleExport('json')">JSON</button>
                  <button (click)="handleExport('html')">HTML</button>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Confidence Overview -->
      <div class="confidence-section">
        <div class="confidence-card">
          <span class="confidence-label">Synthesis Confidence</span>
          <app-confidence-meter
            [value]="result().synthesisConfidence"
            [options]="{
              showPercentage: true,
              showLabel: true,
              animate: true,
              size: 'large'
            }"
          />
        </div>

        <div class="confidence-card">
          <span class="confidence-label">Consensus Strength</span>
          <app-confidence-meter
            [value]="result().analysis.consensusStrength"
            [options]="{
              showPercentage: true,
              showLabel: true,
              animate: true,
              size: 'large'
            }"
          />
        </div>
      </div>

      <!-- Main Response -->
      <div class="response-section">
        <h3 class="section-title">Synthesized Response</h3>
        <div class="response-content">
          <app-streaming-text
            [text]="result().synthesizedResponse"
            [isStreaming]="false"
            [options]="{ enableMarkdown: true, showCursor: false, autoScroll: false }"
          />
        </div>
      </div>

      <!-- Agreements -->
      @if (agreements().length > 0 && options().showSources) {
        <div class="analysis-section">
          <h3 class="section-title">
            Key Agreements
            <span class="count-badge">{{ agreements().length }}</span>
          </h3>
          <div class="points-list">
            @for (point of agreements(); track point.point) {
              <div class="point-card agreement">
                <div class="point-header">
                  <span class="point-category">{{ point.category }}</span>
                  <span class="point-strength">
                    {{ (point.strength * 100).toFixed(0) }}% agreement
                  </span>
                </div>
                <p class="point-text">{{ point.point }}</p>
                @if (options().showConfidence) {
                  <div class="point-agents">
                    @for (agentId of point.agentIds; track agentId) {
                      <span class="agent-chip">{{ agentId }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Disagreements -->
      @if (disagreements().length > 0 && options().highlightDisagreements) {
        <div class="analysis-section">
          <h3 class="section-title warning">
            Disagreements
            <span class="count-badge warning">{{ disagreements().length }}</span>
          </h3>
          <div class="points-list">
            @for (point of disagreements(); track point.topic) {
              <div class="point-card disagreement">
                <div class="point-header">
                  <span class="point-topic">{{ point.topic }}</span>
                  @if (point.requiresHumanReview) {
                    <span class="review-badge">Needs Review</span>
                  }
                </div>
                <div class="positions">
                  @for (pos of point.positions; track pos.agentId) {
                    <div class="position-item">
                      <span class="position-agent">{{ pos.agentId }}</span>
                      <p class="position-text">{{ pos.position }}</p>
                    </div>
                  }
                </div>
                @if (point.resolution) {
                  <div class="resolution">
                    <span class="resolution-label">Resolution:</span>
                    <p class="resolution-text">{{ point.resolution }}</p>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Unique Insights -->
      @if (uniqueInsights().length > 0) {
        <div class="analysis-section">
          <h3 class="section-title">
            Unique Insights
            <span class="count-badge">{{ uniqueInsights().length }}</span>
          </h3>
          <div class="points-list">
            @for (insight of uniqueInsights(); track insight.point) {
              <div class="point-card insight" [class.high-value]="insight.value === 'high'">
                <div class="point-header">
                  <span class="point-category">{{ insight.category }}</span>
                  <span class="insight-value" [class]="insight.value">
                    {{ insight.value }} value
                  </span>
                </div>
                <p class="point-text">{{ insight.point }}</p>
                <span class="insight-source">From: {{ insight.agentId }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Cost Summary -->
      @if (costSummary()) {
        <div class="cost-section">
          <h3 class="section-title">Cost Breakdown</h3>
          <app-cost-estimator
            [summary]="costSummary()!"
            [showBreakdown]="true"
            [showStats]="true"
          />
        </div>
      }

      <!-- Metadata -->
      <div class="metadata-section">
        <div class="meta-item">
          <span class="meta-label">Agents</span>
          <span class="meta-value">{{ result().responses.length }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Total Tokens</span>
          <span class="meta-value">{{ formatTokens(result().totalTokens) }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Duration</span>
          <span class="meta-value">{{ formatDuration(result().totalDuration) }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Completed</span>
          <span class="meta-value">{{ formatTime(result().completedAt) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .synthesis-viewer {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 24px;
    }

    /* Header */
    .viewer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .viewer-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .synthesis-method {
      font-size: 12px;
      padding: 4px 8px;
      background: var(--bg-tertiary, #262626);
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .export-dropdown {
      position: relative;
    }

    .export-btn {
      padding: 8px 16px;
      background: var(--bg-tertiary, #262626);
      border: none;
      border-radius: 6px;
      font-size: 13px;
      color: var(--text-primary);
      cursor: pointer;
      transition: background 0.2s;
    }

    .export-btn:hover {
      background: var(--bg-secondary, #1a1a1a);
    }

    .export-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border-color, #374151);
      border-radius: 6px;
      overflow: hidden;
      z-index: 10;
    }

    .export-menu button {
      display: block;
      width: 100%;
      padding: 10px 16px;
      background: none;
      border: none;
      font-size: 13px;
      color: var(--text-primary);
      cursor: pointer;
      text-align: left;
    }

    .export-menu button:hover {
      background: var(--bg-tertiary, #262626);
    }

    /* Confidence Section */
    .confidence-section {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .confidence-card {
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    .confidence-label {
      display: block;
      font-size: 12px;
      color: var(--text-muted, #6b7280);
      margin-bottom: 12px;
    }

    /* Sections */
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title.warning {
      color: #f59e0b;
    }

    .count-badge {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--accent-color, #3b82f6);
      color: white;
      border-radius: 10px;
      font-weight: 500;
    }

    .count-badge.warning {
      background: #f59e0b;
    }

    /* Response Section */
    .response-section {
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    .response-content {
      max-height: 400px;
      overflow-y: auto;
    }

    /* Analysis Sections */
    .analysis-section {
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    .points-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .point-card {
      padding: 12px;
      background: var(--bg-tertiary, #262626);
      border-radius: 6px;
      border-left: 3px solid var(--border-color, #374151);
    }

    .point-card.agreement {
      border-left-color: #22c55e;
    }

    .point-card.disagreement {
      border-left-color: #f59e0b;
    }

    .point-card.insight {
      border-left-color: #8b5cf6;
    }

    .point-card.high-value {
      background: rgba(139, 92, 246, 0.1);
    }

    .point-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .point-category {
      font-size: 11px;
      text-transform: uppercase;
      color: var(--text-muted, #6b7280);
    }

    .point-strength {
      font-size: 11px;
      color: #22c55e;
    }

    .point-text {
      font-size: 13px;
      color: var(--text-primary);
      margin: 0;
      line-height: 1.5;
    }

    .point-agents {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .agent-chip {
      font-size: 10px;
      padding: 2px 6px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .point-topic {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .review-badge {
      font-size: 10px;
      padding: 2px 8px;
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      border-radius: 4px;
    }

    .positions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .position-item {
      padding: 8px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 4px;
    }

    .position-agent {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .position-text {
      font-size: 12px;
      color: var(--text-primary);
      margin: 4px 0 0;
    }

    .resolution {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color, #374151);
    }

    .resolution-label {
      font-size: 11px;
      color: #22c55e;
      font-weight: 500;
    }

    .resolution-text {
      font-size: 12px;
      color: var(--text-primary);
      margin: 4px 0 0;
    }

    .insight-value {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .insight-value.high {
      background: rgba(139, 92, 246, 0.2);
      color: #8b5cf6;
    }

    .insight-value.medium {
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
    }

    .insight-value.low {
      background: var(--bg-secondary, #1a1a1a);
      color: var(--text-muted, #6b7280);
    }

    .insight-source {
      display: block;
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      margin-top: 8px;
    }

    /* Cost Section */
    .cost-section {
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    /* Metadata */
    .metadata-section {
      display: flex;
      justify-content: space-between;
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .meta-label {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }

    .meta-value {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }
  `],
})
export class SynthesisViewerComponent {
  // Inputs
  result = input.required<VerificationResult>();
  costSummary = input<SessionCostSummary | null>(null);
  options = input<SynthesisDisplayOptions>({
    showSources: true,
    showConfidence: true,
    highlightDisagreements: true,
    collapsible: true,
    showExport: true,
  });

  // Outputs
  exportRequest = output<VerificationExportFormat>();

  // Internal state
  showExportMenu = signal(false);

  // Computed
  methodLabel = computed(() => {
    const method = this.result().synthesisMethod;
    const labels: Record<string, string> = {
      consensus: 'Consensus',
      debate: 'Debate',
      'majority-vote': 'Majority Vote',
      'best-of': 'Best Of',
      merge: 'Merge',
      hierarchical: 'Hierarchical',
    };
    return labels[method] || method;
  });

  agreements = computed(() => this.result().analysis.agreements);
  disagreements = computed(() => this.result().analysis.disagreements);
  uniqueInsights = computed(() => this.result().analysis.uniqueInsights);

  // ============================================
  // Methods
  // ============================================

  toggleExportMenu(): void {
    this.showExportMenu.update(v => !v);
  }

  handleExport(format: VerificationExportFormat): void {
    this.showExportMenu.set(false);
    this.exportRequest.emit(format);
  }

  formatTokens(tokens: number): string {
    if (tokens < 1000) return tokens.toString();
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
