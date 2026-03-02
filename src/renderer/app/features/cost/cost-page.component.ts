/**
 * Cost Tracking Page
 * Token usage, costs, and budget management for all AI instances.
 */

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CostIpcService } from '../../core/services/ipc/cost-ipc.service';
import type { IpcResponse } from '../../core/services/ipc/electron-ipc.service';
import { EchartsThemedComponent } from '../../shared/components/echarts-themed/echarts-themed.component';
import type { EChartsOption } from 'echarts';

// ─── Local data shapes ────────────────────────────────────────────────────────

interface CostSummary {
  totalCost: number;
  sessionCount: number;
  modelBreakdown: { name: string; value: number }[];
}

interface CostHistoryEntry {
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface BudgetStatus {
  daily?: number;
  weekly?: number;
  monthly?: number;
  warningThreshold?: number;
  spentToday?: number;
  spentThisWeek?: number;
  spentThisMonth?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-cost-page',
  standalone: true,
  imports: [CommonModule, EchartsThemedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <!-- Page header -->
      <div class="page-header">
        <button class="header-btn" type="button" (click)="goBack()">← Back</button>
        <div class="header-title">
          <span class="title">Cost Tracking</span>
          <span class="subtitle">Token usage, costs, and budget management</span>
        </div>
        <div class="header-actions">
          <button class="btn" type="button" [disabled]="working()" (click)="refreshAll(true)">
            Refresh
          </button>
        </div>
      </div>

      <!-- Error banner -->
      @if (errorMessage()) {
        <div class="error-banner">{{ errorMessage() }}</div>
      }

      <!-- Info banner -->
      @if (infoMessage()) {
        <div class="info-banner">{{ infoMessage() }}</div>
      }

      <!-- Budget alert banner -->
      @if (budgetAlert()) {
        <div class="alert-banner">{{ budgetAlert() }}</div>
      }

      <!-- Metric cards -->
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-value">\${{ totalSpend().toFixed(4) }}</div>
          <div class="metric-label">Total Spend</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{{ sessionCount() }}</div>
          <div class="metric-label">Session Count</div>
        </div>
        <div class="metric-card" [class.over-budget]="budgetUsedPct() >= 100">
          <div class="metric-value">{{ budgetUsedPct().toFixed(1) }}%</div>
          <div class="metric-label">Budget Used</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">\${{ avgCostPerSession().toFixed(4) }}</div>
          <div class="metric-label">Avg Cost / Session</div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="charts-row">
        <!-- Cost over time -->
        <div class="chart-card">
          <div class="chart-title">Cost Over Time</div>
          <app-echarts-themed
            [options]="lineChartOptions()"
            [loading]="loading()"
            height="260px"
            emptyMessage="No cost history yet"
          />
        </div>

        <!-- Cost by model -->
        <div class="chart-card">
          <div class="chart-title">Cost by Model</div>
          <app-echarts-themed
            [options]="donutChartOptions()"
            [loading]="loading()"
            height="260px"
            emptyMessage="No model breakdown yet"
          />
        </div>
      </div>

      <!-- History table -->
      <div class="panel-card">
        <div class="panel-title">Recent Cost History</div>
        @if (history().length > 0) {
          <div class="table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Model</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of history(); track entry.timestamp) {
                  <tr>
                    <td class="mono">{{ formatTimestamp(entry.timestamp) }}</td>
                    <td>{{ entry.model }}</td>
                    <td class="mono">{{ entry.inputTokens.toLocaleString() }}</td>
                    <td class="mono">{{ entry.outputTokens.toLocaleString() }}</td>
                    <td class="mono">\${{ entry.cost.toFixed(6) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-hint">No usage recorded yet.</div>
        }
      </div>

      <!-- Budget config panel -->
      <div class="panel-card">
        <div class="panel-title">Budget Configuration</div>
        <div class="budget-grid">
          <label class="field">
            <span class="label">Daily Limit ($)</span>
            <input
              class="input"
              type="number"
              min="0"
              step="0.01"
              [value]="budgetDaily() ?? ''"
              (input)="onBudgetDailyInput($event)"
              placeholder="No limit"
            />
          </label>
          <label class="field">
            <span class="label">Weekly Limit ($)</span>
            <input
              class="input"
              type="number"
              min="0"
              step="0.01"
              [value]="budgetWeekly() ?? ''"
              (input)="onBudgetWeeklyInput($event)"
              placeholder="No limit"
            />
          </label>
          <label class="field">
            <span class="label">Monthly Limit ($)</span>
            <input
              class="input"
              type="number"
              min="0"
              step="0.01"
              [value]="budgetMonthly() ?? ''"
              (input)="onBudgetMonthlyInput($event)"
              placeholder="No limit"
            />
          </label>
          <label class="field">
            <span class="label">Warning Threshold (0–1)</span>
            <input
              class="input"
              type="number"
              min="0"
              max="1"
              step="0.05"
              [value]="budgetWarning() ?? ''"
              (input)="onBudgetWarningInput($event)"
              placeholder="e.g. 0.8"
            />
          </label>
        </div>
        <div class="budget-actions">
          <button class="btn primary" type="button" [disabled]="working()" (click)="saveBudget()">
            Save Budget
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
    }

    .page {
      width: 100%;
      height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding: var(--spacing-lg);
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    /* ── Header ─────────────────────────────────────── */
    .page-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .header-title {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .title {
      font-size: 18px;
      font-weight: 700;
    }

    .subtitle {
      font-size: 12px;
      color: var(--text-muted);
    }

    .header-actions {
      display: flex;
      gap: var(--spacing-sm);
    }

    /* ── Buttons ────────────────────────────────────── */
    .header-btn,
    .btn {
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 12px;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .header-btn:hover,
    .btn:hover:not(:disabled) {
      background: var(--bg-secondary);
    }

    .btn.primary {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: #fff;
    }

    .btn.primary:hover:not(:disabled) {
      opacity: 0.9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Banners ────────────────────────────────────── */
    .error-banner,
    .info-banner,
    .alert-banner {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-sm);
      font-size: 12px;
    }

    .error-banner {
      border: 1px solid color-mix(in srgb, var(--error-color) 60%, transparent);
      background: color-mix(in srgb, var(--error-color) 14%, transparent);
      color: var(--error-color);
    }

    .info-banner {
      border: 1px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
      color: var(--text-primary);
    }

    .alert-banner {
      border: 1px solid color-mix(in srgb, #f97316 60%, transparent);
      background: color-mix(in srgb, #f97316 12%, transparent);
      color: #f97316;
    }

    /* ── Metric cards ───────────────────────────────── */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }

    .metric-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      text-align: center;
    }

    .metric-card.over-budget {
      border-color: var(--error-color);
    }

    .metric-value {
      font-size: 28px;
      font-weight: 700;
      font-family: var(--font-family-mono);
      line-height: 1.2;
    }

    .metric-label {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: var(--spacing-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* ── Charts ─────────────────────────────────────── */
    .charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
    }

    .chart-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
    }

    .chart-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: var(--spacing-sm);
    }

    /* ── Panel cards (table + budget) ───────────────── */
    .panel-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .panel-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* ── History table ──────────────────────────────── */
    .table-wrapper {
      overflow-x: auto;
    }

    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .history-table th,
    .history-table td {
      padding: var(--spacing-xs) var(--spacing-sm);
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    .history-table th {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .history-table tr:hover td {
      background: var(--bg-tertiary);
    }

    .mono {
      font-family: var(--font-family-mono);
    }

    .empty-hint {
      font-size: 12px;
      color: var(--text-muted);
      padding: var(--spacing-sm) 0;
    }

    /* ── Budget form ────────────────────────────────── */
    .budget-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .input {
      width: 100%;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 12px;
      font-family: var(--font-family-mono);
      transition: border-color var(--transition-fast);
    }

    .input:focus {
      outline: none;
      border-color: var(--primary-color);
    }

    .budget-actions {
      display: flex;
      justify-content: flex-end;
    }
  `],
})
export class CostPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly costIpc = inject(CostIpcService);

  // ── State signals ────────────────────────────────────────────────────────

  readonly loading = signal(false);
  readonly working = signal(false);
  readonly errorMessage = signal('');
  readonly infoMessage = signal('');
  readonly budgetAlert = signal('');

  readonly summary = signal<CostSummary>({ totalCost: 0, sessionCount: 0, modelBreakdown: [] });
  readonly history = signal<CostHistoryEntry[]>([]);
  readonly budgetStatus = signal<BudgetStatus>({});

  // Budget form fields
  readonly budgetDaily = signal<number | null>(null);
  readonly budgetWeekly = signal<number | null>(null);
  readonly budgetMonthly = signal<number | null>(null);
  readonly budgetWarning = signal<number | null>(null);

  // ── Computed values ──────────────────────────────────────────────────────

  readonly totalSpend = computed(() => this.summary().totalCost);
  readonly sessionCount = computed(() => this.summary().sessionCount);

  readonly avgCostPerSession = computed(() => {
    const count = this.sessionCount();
    return count > 0 ? this.totalSpend() / count : 0;
  });

  readonly budgetUsedPct = computed(() => {
    const status = this.budgetStatus();
    const monthly = status.monthly ?? 0;
    const spent = status.spentThisMonth ?? 0;
    if (monthly <= 0) return 0;
    return (spent / monthly) * 100;
  });

  readonly lineChartOptions = computed((): EChartsOption | null => {
    const entries = this.history();
    if (entries.length === 0) return null;

    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const timestamps = sorted.map(e => this.formatTimestamp(e.timestamp));
    const costs = sorted.map(e => e.cost);

    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: timestamps },
      yAxis: { type: 'value', axisLabel: { formatter: '${value}' } },
      series: [{
        type: 'line',
        data: costs,
        smooth: true,
        areaStyle: { opacity: 0.1 },
      }],
    };
  });

  readonly donutChartOptions = computed((): EChartsOption | null => {
    const breakdown = this.summary().modelBreakdown;
    if (breakdown.length === 0) return null;

    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        data: breakdown,
      }],
    };
  });

  // ── Lifecycle & event subscriptions ─────────────────────────────────────

  private readonly unsubscribers: (() => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.unsubscribers.push(
      this.costIpc.onCostUsageRecorded(() => {
        void this.refreshAll(false);
      }),
      this.costIpc.onCostBudgetWarning((data) => {
        const msg = (data as { message?: string })?.message ?? 'Budget warning threshold reached';
        this.budgetAlert.set(`Warning: ${msg}`);
      }),
      this.costIpc.onCostBudgetExceeded((data) => {
        const msg = (data as { message?: string })?.message ?? 'Budget limit exceeded';
        this.budgetAlert.set(`Budget exceeded: ${msg}`);
      }),
    );
  }

  ngOnInit(): void {
    void this.refreshAll(true);
    this.pollTimer = setInterval(() => void this.refreshAll(false), 10_000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
    }
    for (const unsub of this.unsubscribers) {
      unsub();
    }
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  async refreshAll(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [summaryResp, historyResp, budgetResp] = await Promise.all([
        this.costIpc.costGetSummary(),
        this.costIpc.costGetHistory(undefined, 50),
        this.costIpc.costGetBudgetStatus(),
      ]);

      this.summary.set(this.unwrapData<CostSummary>(summaryResp, {
        totalCost: 0,
        sessionCount: 0,
        modelBreakdown: [],
      }));

      this.history.set(this.unwrapData<CostHistoryEntry[]>(historyResp, []));

      const budget = this.unwrapData<BudgetStatus>(budgetResp, {});
      this.budgetStatus.set(budget);

      // Populate form fields from loaded budget config
      this.budgetDaily.set(budget.daily ?? null);
      this.budgetWeekly.set(budget.weekly ?? null);
      this.budgetMonthly.set(budget.monthly ?? null);
      this.budgetWarning.set(budget.warningThreshold ?? null);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to load cost data');
    } finally {
      if (showLoading) this.loading.set(false);
    }
  }

  // ── Budget form handlers ─────────────────────────────────────────────────

  onBudgetDailyInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.budgetDaily.set(isNaN(val) ? null : val);
  }

  onBudgetWeeklyInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.budgetWeekly.set(isNaN(val) ? null : val);
  }

  onBudgetMonthlyInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.budgetMonthly.set(isNaN(val) ? null : val);
  }

  onBudgetWarningInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.budgetWarning.set(isNaN(val) ? null : val);
  }

  async saveBudget(): Promise<void> {
    this.working.set(true);
    try {
      const resp = await this.costIpc.costSetBudget({
        daily: this.budgetDaily() ?? undefined,
        weekly: this.budgetWeekly() ?? undefined,
        monthly: this.budgetMonthly() ?? undefined,
        warningThreshold: this.budgetWarning() ?? undefined,
      });
      if (!resp.success) {
        this.errorMessage.set(resp.error?.message ?? 'Failed to save budget');
        return;
      }
      this.infoMessage.set('Budget saved');
      await this.refreshAll(false);
    } finally {
      this.working.set(false);
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  goBack(): void {
    void this.router.navigate(['/']);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private unwrapData<T>(response: IpcResponse, fallback: T): T {
    return response.success ? ((response.data as T) ?? fallback) : fallback;
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
