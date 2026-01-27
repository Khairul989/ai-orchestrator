/**
 * Routing Explanation Component
 *
 * Phase 7 UI/UX Improvement: Explains model routing decisions
 * - Detected complexity with visual indicator
 * - Matched keywords and analysis factors
 * - Confidence level and cost savings
 * - Alternative routing options
 */

import { Component, signal, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RoutingExplanation {
  summary: string;
  complexityDisplay: {
    level: 'simple' | 'moderate' | 'complex';
    label: string;
    color: 'success' | 'warning' | 'info';
  };
  confidencePercent: number;
  matchedKeywords: {
    keyword: string;
    type: 'complex' | 'simple';
  }[];
  factors: {
    description: string;
    impact: 'increases_complexity' | 'decreases_complexity' | 'neutral';
  }[];
  alternatives: {
    model: string;
    tier: 'fast' | 'balanced' | 'powerful';
    reason: string;
  }[];
  costComparison: {
    selectedTier: 'fast' | 'balanced' | 'powerful';
    selectedCostMultiplier: number;
    savingsVsPowerful: number;
    savingsVsBalanced: number;
  };
}

export interface RoutingDecision {
  model: string;
  complexity: 'simple' | 'moderate' | 'complex';
  tier: 'fast' | 'balanced' | 'powerful';
  confidence: number;
  reason: string;
  estimatedSavingsPercent?: number;
  explanation?: RoutingExplanation;
}

@Component({
  selector: 'app-routing-explanation',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (decision()) {
      <div class="routing-explanation" [class.expanded]="expanded()">
        <!-- Compact view - always visible -->
        <div class="compact-view" (click)="toggleExpanded()">
          <div class="model-info">
            <span class="model-icon">
              @switch (decision()!.tier) {
                @case ('fast') {
                  <span title="Fast model">&#9889;</span>
                }
                @case ('balanced') {
                  <span title="Balanced model">&#9881;</span>
                }
                @case ('powerful') {
                  <span title="Powerful model">&#10024;</span>
                }
              }
            </span>
            <span class="model-name">{{ getModelDisplayName(decision()!.model) }}</span>
            <span class="complexity-badge" [class]="decision()!.complexity">
              {{ decision()!.complexity }}
            </span>
          </div>

          <div class="quick-stats">
            <span class="confidence" [title]="'Confidence: ' + decision()!.confidence * 100 + '%'">
              {{ (decision()!.confidence * 100).toFixed(0) }}%
            </span>
            @if (decision()?.estimatedSavingsPercent && decision()!.estimatedSavingsPercent! > 0) {
              <span class="savings" [title]="'Cost savings vs powerful model'">
                -{{ decision()?.estimatedSavingsPercent }}%
              </span>
            }
            <span class="expand-icon" [class.expanded]="expanded()">&#9656;</span>
          </div>
        </div>

        <!-- Expanded view -->
        @if (expanded() && explanation()) {
          <div class="expanded-view">
            <!-- Summary -->
            <div class="summary-section">
              <p class="summary-text">{{ explanation()!.summary }}</p>
            </div>

            <!-- Matched Keywords -->
            @if (explanation()!.matchedKeywords.length > 0) {
              <div class="keywords-section">
                <div class="section-header">Matched Keywords</div>
                <div class="keywords-list">
                  @for (kw of explanation()!.matchedKeywords; track kw.keyword) {
                    <span class="keyword" [class]="kw.type">
                      {{ kw.keyword }}
                    </span>
                  }
                </div>
              </div>
            }

            <!-- Analysis Factors -->
            @if (explanation()!.factors.length > 0) {
              <div class="factors-section">
                <div class="section-header">Analysis Factors</div>
                <div class="factors-list">
                  @for (factor of explanation()!.factors; track factor.description) {
                    <div class="factor" [class]="factor.impact">
                      <span class="factor-icon">
                        @switch (factor.impact) {
                          @case ('increases_complexity') {
                            &#9650;
                          }
                          @case ('decreases_complexity') {
                            &#9660;
                          }
                          @case ('neutral') {
                            &#9679;
                          }
                        }
                      </span>
                      <span class="factor-text">{{ factor.description }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Cost Comparison -->
            <div class="cost-section">
              <div class="section-header">Cost Comparison</div>
              <div class="cost-bars">
                <div class="cost-bar">
                  <div class="cost-label">Fast (Haiku)</div>
                  <div class="cost-progress">
                    <div class="cost-fill fast" style="width: 20%"></div>
                  </div>
                  <div class="cost-value">0.2x</div>
                </div>
                <div class="cost-bar">
                  <div class="cost-label">Balanced (Sonnet)</div>
                  <div class="cost-progress">
                    <div class="cost-fill balanced" style="width: 60%"></div>
                  </div>
                  <div class="cost-value">0.6x</div>
                </div>
                <div class="cost-bar">
                  <div class="cost-label">Powerful (Opus)</div>
                  <div class="cost-progress">
                    <div class="cost-fill powerful" style="width: 100%"></div>
                  </div>
                  <div class="cost-value">1.0x</div>
                </div>
              </div>
              <div class="selected-tier">
                Selected: <strong>{{ explanation()!.costComparison.selectedTier }}</strong>
                @if (explanation()!.costComparison.savingsVsPowerful > 0) {
                  <span class="tier-savings">
                    ({{ explanation()!.costComparison.savingsVsPowerful }}% cheaper than powerful)
                  </span>
                }
              </div>
            </div>

            <!-- Alternatives -->
            @if (explanation()!.alternatives.length > 0) {
              <div class="alternatives-section">
                <div class="section-header">Alternative Options</div>
                <div class="alternatives-list">
                  @for (alt of explanation()!.alternatives; track alt.model) {
                    <div class="alternative">
                      <div class="alt-header">
                        <span class="alt-model">{{ getModelDisplayName(alt.model) }}</span>
                        <span class="alt-tier">{{ alt.tier }}</span>
                      </div>
                      <div class="alt-reason">{{ alt.reason }}</div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .routing-explanation {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      .compact-view {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-xs) var(--spacing-sm);
        cursor: pointer;
        transition: background var(--transition-fast);

        &:hover {
          background: var(--bg-tertiary);
        }
      }

      .model-info {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
      }

      .model-icon {
        font-size: 14px;
      }

      .model-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .complexity-badge {
        padding: 2px 6px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;

        &.simple {
          background: rgba(46, 204, 113, 0.2);
          color: var(--success-color);
        }

        &.moderate {
          background: rgba(52, 152, 219, 0.2);
          color: var(--primary-color);
        }

        &.complex {
          background: rgba(241, 196, 15, 0.2);
          color: var(--warning-color);
        }
      }

      .quick-stats {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }

      .confidence {
        font-size: 11px;
        font-family: monospace;
        color: var(--text-secondary);
      }

      .savings {
        font-size: 10px;
        padding: 2px 4px;
        background: rgba(46, 204, 113, 0.2);
        color: var(--success-color);
        border-radius: 3px;
        font-weight: 500;
      }

      .expand-icon {
        font-size: 10px;
        color: var(--text-muted);
        transition: transform 0.2s ease;

        &.expanded {
          transform: rotate(90deg);
        }
      }

      .expanded-view {
        border-top: 1px solid var(--border-color);
        padding: var(--spacing-sm);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .section-header {
        font-size: 10px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: var(--spacing-xs);
      }

      .summary-section {
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
      }

      .summary-text {
        margin: 0;
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.4;
      }

      .keywords-list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-xs);
      }

      .keyword {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;

        &.complex {
          background: rgba(241, 196, 15, 0.15);
          color: var(--warning-color);
          border: 1px solid rgba(241, 196, 15, 0.3);
        }

        &.simple {
          background: rgba(46, 204, 113, 0.15);
          color: var(--success-color);
          border: 1px solid rgba(46, 204, 113, 0.3);
        }
      }

      .factors-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .factor {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        font-size: 11px;
        padding: 4px var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
      }

      .factor-icon {
        font-size: 8px;
      }

      .factor.increases_complexity {
        .factor-icon {
          color: var(--warning-color);
        }
      }

      .factor.decreases_complexity {
        .factor-icon {
          color: var(--success-color);
        }
      }

      .factor.neutral {
        .factor-icon {
          color: var(--text-muted);
        }
      }

      .factor-text {
        color: var(--text-secondary);
      }

      .cost-bars {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: var(--spacing-xs);
      }

      .cost-bar {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }

      .cost-label {
        font-size: 10px;
        color: var(--text-muted);
        width: 110px;
        flex-shrink: 0;
      }

      .cost-progress {
        flex: 1;
        height: 6px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        overflow: hidden;
      }

      .cost-fill {
        height: 100%;
        border-radius: 3px;

        &.fast {
          background: var(--success-color);
        }

        &.balanced {
          background: var(--primary-color);
        }

        &.powerful {
          background: var(--warning-color);
        }
      }

      .cost-value {
        font-size: 10px;
        font-family: monospace;
        color: var(--text-muted);
        width: 30px;
        text-align: right;
      }

      .selected-tier {
        font-size: 11px;
        color: var(--text-secondary);
        text-align: center;
        padding-top: var(--spacing-xs);
        border-top: 1px solid var(--border-color);
      }

      .tier-savings {
        color: var(--success-color);
      }

      .alternatives-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
      }

      .alternative {
        padding: var(--spacing-xs) var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
      }

      .alt-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
      }

      .alt-model {
        font-size: 11px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .alt-tier {
        font-size: 9px;
        padding: 1px 4px;
        background: var(--bg-primary);
        border-radius: 3px;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .alt-reason {
        font-size: 10px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class RoutingExplanationComponent {
  decision = input<RoutingDecision | null>(null);

  expanded = signal(false);

  explanation = computed(() => this.decision()?.explanation);

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
  }

  getModelDisplayName(modelId: string): string {
    const lowerModel = modelId.toLowerCase();

    if (lowerModel.includes('haiku')) {
      return 'Claude Haiku';
    } else if (lowerModel.includes('opus')) {
      return 'Claude Opus';
    } else if (lowerModel.includes('sonnet')) {
      return 'Claude Sonnet';
    }

    // Clean up model ID for display
    return modelId
      .replace('claude-', '')
      .replace('anthropic/', '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
