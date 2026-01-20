/**
 * RLM Analytics Component
 *
 * Dashboard for visualizing RLM effectiveness metrics:
 * - Token savings over time
 * - Query performance statistics
 * - Storage utilization
 * - Learning insights
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';

interface TokenSavingsData {
  date: string;
  directTokens: number;
  actualTokens: number;
  savingsPercent: number;
}

interface QueryStats {
  type: string;
  count: number;
  avgDuration: number;
  avgTokens: number;
}

interface StorageStats {
  totalStores: number;
  totalSections: number;
  totalTokens: number;
  totalSizeBytes: number;
  byType: { type: string; count: number; tokens: number }[];
}

interface InsightData {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  createdAt: number;
}

@Component({
  selector: 'app-rlm-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="analytics-dashboard">
      <header class="dashboard-header">
        <h2>RLM Analytics</h2>
        <div class="header-actions">
          <select class="time-select" [(ngModel)]="timeRange" (change)="loadData()">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button class="refresh-btn" (click)="loadData()">
            ↻ Refresh
          </button>
        </div>
      </header>

      <!-- Token Savings Overview -->
      <section class="metrics-grid">
        <div class="metric-card highlight">
          <div class="metric-value">{{ totalSavingsPercent().toFixed(1) }}%</div>
          <div class="metric-label">Total Token Savings</div>
          <div class="metric-detail">
            {{ formatNumber(totalTokensSaved()) }} tokens saved
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-value">{{ totalQueries() }}</div>
          <div class="metric-label">Total Queries</div>
          <div class="metric-detail">
            {{ avgQueryDuration().toFixed(0) }}ms avg duration
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-value">{{ storageStats()?.totalStores || 0 }}</div>
          <div class="metric-label">Context Stores</div>
          <div class="metric-detail">
            {{ formatBytes(storageStats()?.totalSizeBytes || 0) }} total
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-value">{{ insights().length }}</div>
          <div class="metric-label">Active Insights</div>
          <div class="metric-detail">
            {{ highConfidenceInsights() }} high confidence
          </div>
        </div>
      </section>

      <!-- Token Savings Chart -->
      <section class="chart-section">
        <h3>Token Savings Over Time</h3>
        @if (tokenSavingsHistory().length > 0) {
          <div class="chart-container">
            <div class="savings-chart">
              @for (point of tokenSavingsHistory(); track point.date) {
                <div class="chart-bar-group">
                  <div
                    class="chart-bar direct"
                    [style.height.%]="getBarHeight(point.directTokens)"
                    [title]="'Direct: ' + formatNumber(point.directTokens) + ' tokens'"
                  ></div>
                  <div
                    class="chart-bar actual"
                    [style.height.%]="getBarHeight(point.actualTokens)"
                    [title]="'Actual: ' + formatNumber(point.actualTokens) + ' tokens'"
                  ></div>
                  <div class="chart-label">{{ formatDateShort(point.date) }}</div>
                </div>
              }
            </div>
            <div class="chart-legend">
              <span class="legend-item">
                <span class="legend-color direct"></span>
                Direct (without RLM)
              </span>
              <span class="legend-item">
                <span class="legend-color actual"></span>
                Actual (with RLM)
              </span>
            </div>
          </div>
        } @else {
          <div class="empty-chart">
            <span class="empty-icon">📊</span>
            <span>No data available for the selected time range</span>
          </div>
        }
      </section>

      <!-- Query Statistics -->
      <section class="stats-section">
        <h3>Query Performance</h3>
        @if (queryStats().length > 0) {
          <div class="stats-table">
            <table>
              <thead>
                <tr>
                  <th>Query Type</th>
                  <th>Count</th>
                  <th>Avg Duration</th>
                  <th>Avg Tokens</th>
                </tr>
              </thead>
              <tbody>
                @for (stat of queryStats(); track stat.type) {
                  <tr>
                    <td>
                      <span class="query-type-badge">{{ getQueryTypeIcon(stat.type) }} {{ stat.type }}</span>
                    </td>
                    <td>{{ stat.count }}</td>
                    <td>{{ stat.avgDuration.toFixed(0) }}ms</td>
                    <td>{{ stat.avgTokens.toFixed(0) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state">No query statistics available</div>
        }
      </section>

      <!-- Storage Breakdown -->
      <section class="storage-section">
        <h3>Storage by Type</h3>
        @if ((storageStats()?.byType || []).length > 0) {
          <div class="storage-breakdown">
            @for (type of storageStats()?.byType || []; track type.type) {
              <div class="storage-type">
                <div class="type-header">
                  <span class="type-name">{{ getSectionTypeIcon(type.type) }} {{ type.type }}</span>
                  <span class="type-count">{{ type.count }} sections</span>
                </div>
                <div class="type-bar">
                  <div
                    class="type-fill"
                    [style.width.%]="getStoragePercent(type.tokens)"
                  ></div>
                </div>
                <div class="type-tokens">{{ formatNumber(type.tokens) }} tokens</div>
              </div>
            }
          </div>
        } @else {
          <div class="empty-state">No storage data available</div>
        }
      </section>

      <!-- Insights -->
      <section class="insights-section">
        <h3>Learning Insights</h3>
        <div class="insights-list">
          @for (insight of insights(); track insight.id) {
            <div class="insight-card" [class.high-confidence]="insight.confidence >= 0.8">
              <div class="insight-header">
                <span class="insight-type">{{ insight.type }}</span>
                <span class="insight-confidence">
                  {{ (insight.confidence * 100).toFixed(0) }}% confidence
                </span>
              </div>
              <div class="insight-title">{{ insight.title }}</div>
              @if (insight.description) {
                <div class="insight-description">{{ insight.description }}</div>
              }
              <div class="insight-time">
                {{ formatTimestamp(insight.createdAt) }}
              </div>
            </div>
          } @empty {
            <div class="empty-state">
              <span class="empty-icon">💡</span>
              <span>No insights yet. Keep using RLM to generate patterns.</span>
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .analytics-dashboard {
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
      color: var(--text-primary);
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;

      h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }

      .header-actions {
        display: flex;
        gap: 0.5rem;
      }
    }

    .time-select {
      padding: 0.5rem 1rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-size: 0.875rem;
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: var(--primary-color);
      }
    }

    .refresh-btn {
      padding: 0.5rem 1rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-size: 0.875rem;
      cursor: pointer;

      &:hover {
        background: var(--bg-hover);
      }
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .metric-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      text-align: center;

      &.highlight {
        background: linear-gradient(135deg, var(--primary-color) 0%, #5b21b6 100%);
        color: white;
        border: none;

        .metric-detail {
          opacity: 0.85;
        }
      }

      .metric-value {
        font-size: 2rem;
        font-weight: 700;
        line-height: 1.2;
      }

      .metric-label {
        font-size: 0.875rem;
        opacity: 0.8;
        margin-top: 0.25rem;
      }

      .metric-detail {
        font-size: 0.75rem;
        opacity: 0.6;
        margin-top: 0.5rem;
      }
    }

    .chart-section,
    .stats-section,
    .storage-section,
    .insights-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      margin-bottom: 1.5rem;

      h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
      }
    }

    .chart-container {
      padding: 0.5rem 0;
    }

    .savings-chart {
      display: flex;
      align-items: flex-end;
      height: 200px;
      gap: 4px;
      padding-bottom: 24px;
    }

    .chart-bar-group {
      flex: 1;
      display: flex;
      gap: 2px;
      align-items: flex-end;
      position: relative;
      min-width: 20px;

      .chart-label {
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.625rem;
        color: var(--text-muted);
        white-space: nowrap;
      }
    }

    .chart-bar {
      flex: 1;
      border-radius: 2px 2px 0 0;
      min-height: 4px;
      transition: height 0.3s ease;

      &.direct {
        background: #ef4444;
        opacity: 0.5;
      }

      &.actual {
        background: #10b981;
      }
    }

    .chart-legend {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      margin-top: 1rem;

      .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--text-secondary);
      }

      .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 2px;

        &.direct {
          background: #ef4444;
          opacity: 0.5;
        }

        &.actual {
          background: #10b981;
        }
      }
    }

    .empty-chart {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 3rem;
      color: var(--text-muted);

      .empty-icon {
        font-size: 2rem;
        opacity: 0.5;
      }
    }

    .stats-table {
      overflow-x: auto;

      table {
        width: 100%;
        border-collapse: collapse;

        th,
        td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }

        th {
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        td {
          font-size: 0.875rem;
        }
      }
    }

    .query-type-badge {
      padding: 0.25rem 0.5rem;
      background: var(--bg-tertiary);
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
    }

    .storage-breakdown {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .storage-type {
      .type-header {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
      }

      .type-name {
        font-weight: 500;
      }

      .type-count {
        color: var(--text-muted);
      }

      .type-bar {
        height: 8px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        overflow: hidden;

        .type-fill {
          height: 100%;
          background: var(--primary-color);
          transition: width 0.3s ease;
        }
      }

      .type-tokens {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }
    }

    .insights-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .insight-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 1rem;

      &.high-confidence {
        border-color: #10b981;
        border-width: 2px;
      }

      .insight-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5rem;

        .insight-type {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
          font-weight: 500;
        }

        .insight-confidence {
          font-size: 0.75rem;
          color: #10b981;
        }
      }

      .insight-title {
        font-weight: 500;
        margin-bottom: 0.25rem;
      }

      .insight-description {
        font-size: 0.875rem;
        color: var(--text-secondary);
      }

      .insight-time {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.5rem;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 2rem;
      color: var(--text-muted);
      text-align: center;

      .empty-icon {
        font-size: 1.5rem;
        opacity: 0.5;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RlmAnalyticsComponent implements OnInit, OnDestroy {
  private ipc = inject(ElectronIpcService);

  timeRange = '30d';

  readonly tokenSavingsHistory = signal<TokenSavingsData[]>([]);
  readonly queryStats = signal<QueryStats[]>([]);
  readonly storageStats = signal<StorageStats | null>(null);
  readonly insights = signal<InsightData[]>([]);
  readonly isLoading = signal<boolean>(false);

  readonly totalSavingsPercent = computed(() => {
    const history = this.tokenSavingsHistory();
    if (history.length === 0) return 0;
    const totalDirect = history.reduce((sum, h) => sum + h.directTokens, 0);
    const totalActual = history.reduce((sum, h) => sum + h.actualTokens, 0);
    if (totalDirect === 0) return 0;
    return ((totalDirect - totalActual) / totalDirect) * 100;
  });

  readonly totalTokensSaved = computed(() => {
    const history = this.tokenSavingsHistory();
    const totalDirect = history.reduce((sum, h) => sum + h.directTokens, 0);
    const totalActual = history.reduce((sum, h) => sum + h.actualTokens, 0);
    return totalDirect - totalActual;
  });

  readonly totalQueries = computed(() =>
    this.queryStats().reduce((sum, s) => sum + s.count, 0)
  );

  readonly avgQueryDuration = computed(() => {
    const stats = this.queryStats();
    if (stats.length === 0) return 0;
    const total = stats.reduce((sum, s) => sum + s.avgDuration * s.count, 0);
    const count = stats.reduce((sum, s) => sum + s.count, 0);
    return count > 0 ? total / count : 0;
  });

  readonly highConfidenceInsights = computed(() =>
    this.insights().filter(i => i.confidence >= 0.8).length
  );

  private maxTokensInHistory = 0;

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {}

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await Promise.all([
        this.loadTokenSavings(),
        this.loadQueryStats(),
        this.loadStorageStats(),
        this.loadInsights(),
      ]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadTokenSavings(): Promise<void> {
    try {
      const response = await this.ipc.invoke('rlm:get-token-savings-history', {
        range: this.timeRange,
      });
      if (response.success && response.data) {
        const data = response.data as TokenSavingsData[];
        this.tokenSavingsHistory.set(data);
        this.maxTokensInHistory = Math.max(
          1, // Avoid division by zero
          ...data.flatMap((d: TokenSavingsData) => [d.directTokens, d.actualTokens])
        );
      }
    } catch (error) {
      console.error('[RLM Analytics] Failed to load token savings:', error);
    }
  }

  private async loadQueryStats(): Promise<void> {
    try {
      const response = await this.ipc.invoke('rlm:get-query-stats', {
        range: this.timeRange,
      });
      if (response.success && response.data) {
        this.queryStats.set(response.data as QueryStats[]);
      }
    } catch (error) {
      console.error('[RLM Analytics] Failed to load query stats:', error);
    }
  }

  private async loadStorageStats(): Promise<void> {
    try {
      const response = await this.ipc.invoke('rlm:get-storage-stats');
      if (response.success && response.data) {
        this.storageStats.set(response.data as StorageStats);
      }
    } catch (error) {
      console.error('[RLM Analytics] Failed to load storage stats:', error);
    }
  }

  private async loadInsights(): Promise<void> {
    try {
      const response = await this.ipc.invoke('learning:get-insights');
      if (response.success && response.data) {
        this.insights.set(response.data as InsightData[]);
      }
    } catch (error) {
      console.error('[RLM Analytics] Failed to load insights:', error);
    }
  }

  getBarHeight(tokens: number): number {
    return this.maxTokensInHistory > 0
      ? (tokens / this.maxTokensInHistory) * 100
      : 0;
  }

  getStoragePercent(tokens: number): number {
    const total = this.storageStats()?.totalTokens || 0;
    return total > 0 ? (tokens / total) * 100 : 0;
  }

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  formatDateShort(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getQueryTypeIcon(type: string): string {
    switch (type) {
      case 'grep': return '🔍';
      case 'slice': return '✂️';
      case 'sub_query': return '🔄';
      case 'summarize': return '📝';
      case 'get_section': return '📄';
      case 'semantic_search': return '🎯';
      default: return '❓';
    }
  }

  getSectionTypeIcon(type: string): string {
    switch (type) {
      case 'file': return '📁';
      case 'conversation': return '💬';
      case 'tool_output': return '🔧';
      case 'external': return '🌐';
      case 'summary': return '📋';
      default: return '📄';
    }
  }
}
