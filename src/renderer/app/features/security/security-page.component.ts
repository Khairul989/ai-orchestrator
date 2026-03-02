/**
 * Security Page Component
 * Secret detection, audit logging, and environment security for the AI orchestrator.
 */

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SecurityIpcService } from '../../core/services/ipc/security-ipc.service';
import type { IpcResponse } from '../../core/services/ipc/electron-ipc.service';

// ─── Local interfaces ────────────────────────────────────────────────────────

interface AuditEntry {
  timestamp: number;
  action: string;
  instanceId?: string;
  target?: string;
  severity: 'info' | 'warning' | 'error';
  details?: string;
}

interface SecretResult {
  type: string;
  line?: number;
  severity: string;
  value?: string;
}

interface EnvVar {
  name: string;
  value: string;
  allowed: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-security-page',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="security-page">

      <!-- Page header -->
      <div class="page-header">
        <button class="header-btn" type="button" (click)="goBack()">← Back</button>
        <div class="header-title">
          <span class="title">Security &amp; Audit</span>
          <span class="subtitle">Secret detection, audit logging, and environment security</span>
        </div>
        <button class="header-btn refresh-btn" type="button" (click)="refresh()" [disabled]="loading()">
          {{ loading() ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <!-- Tab bar -->
      <div class="tab-bar">
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'audit'"
          type="button"
          (click)="switchTab('audit')"
        >Audit Log</button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'scanner'"
          type="button"
          (click)="switchTab('scanner')"
        >Secret Scanner</button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'environment'"
          type="button"
          (click)="switchTab('environment')"
        >Environment</button>
      </div>

      <!-- Error banner -->
      @if (errorMessage()) {
        <div class="error-banner">{{ errorMessage() }}</div>
      }

      <!-- Tab content -->
      <div class="tab-content">

        <!-- ── Tab 1: Audit Log ───────────────────────────────────────────── -->
        @if (activeTab() === 'audit') {
          <div class="audit-tab">

            <!-- Filters -->
            <div class="filter-bar">
              <label class="filter-label" for="severity-filter">Severity</label>
              <select
                id="severity-filter"
                class="filter-select"
                [value]="auditSeverityFilter()"
                (change)="onSeverityFilterChange($event)"
              >
                <option value="all">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>

              <label class="filter-label" for="limit-input">Limit</label>
              <input
                id="limit-input"
                class="filter-input"
                type="number"
                min="1"
                max="1000"
                [value]="auditLimit()"
                (change)="onLimitChange($event)"
              />

              <div class="filter-spacer"></div>

              <button class="btn" type="button" (click)="exportAuditCsv()">Export CSV</button>
              <button class="btn danger" type="button" (click)="clearAuditLog()">Clear Log</button>
            </div>

            <!-- Table -->
            @if (filteredAuditEntries().length > 0) {
              <div class="table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Agent / Instance</th>
                      <th>Target</th>
                      <th>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of filteredAuditEntries(); track entry.timestamp + entry.action) {
                      <tr>
                        <td class="mono">{{ formatTimestamp(entry.timestamp) }}</td>
                        <td>{{ entry.action }}</td>
                        <td class="muted">{{ entry.instanceId || '—' }}</td>
                        <td class="muted">{{ entry.target || '—' }}</td>
                        <td>
                          <span class="badge" [class]="'badge-' + entry.severity">
                            {{ entry.severity }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="empty-state">No audit entries found.</div>
            }
          </div>
        }

        <!-- ── Tab 2: Secret Scanner ──────────────────────────────────────── -->
        @if (activeTab() === 'scanner') {
          <div class="scanner-tab">
            <div class="scanner-controls">
              <label class="field-label" for="scan-content">Content to scan</label>
              <textarea
                id="scan-content"
                class="scan-textarea"
                [value]="scanContent()"
                placeholder="Paste content here to scan for secrets..."
                (input)="onScanContentInput($event)"
              ></textarea>

              <div class="scanner-row">
                <label class="field-label" for="content-type">Content type</label>
                <select
                  id="content-type"
                  class="filter-select"
                  [value]="scanContentType()"
                  (change)="onContentTypeChange($event)"
                >
                  <option value="auto">Auto</option>
                  <option value="env">Env file</option>
                  <option value="text">Plain text</option>
                </select>

                <button
                  class="btn primary"
                  type="button"
                  [disabled]="scanning() || scanContent().trim().length === 0"
                  (click)="scanForSecrets()"
                >
                  {{ scanning() ? 'Scanning...' : 'Scan' }}
                </button>

                @if (scanResults().length > 0) {
                  <button
                    class="btn"
                    type="button"
                    [disabled]="scanning()"
                    (click)="redactContent()"
                  >
                    Redact
                  </button>
                }
              </div>
            </div>

            <!-- Scan results -->
            @if (scanResults().length > 0) {
              <div class="results-section">
                <div class="results-title">
                  Found {{ scanResults().length }} secret{{ scanResults().length === 1 ? '' : 's' }}
                </div>
                <div class="results-grid">
                  @for (result of scanResults(); track result.type + (result.line ?? 0)) {
                    <div class="result-card">
                      <div class="result-header">
                        <span class="result-type">{{ result.type }}</span>
                        <span class="badge" [class]="getSeverityClass(result.severity)">
                          {{ result.severity }}
                        </span>
                      </div>
                      @if (result.line !== null && result.line !== undefined) {
                        <div class="result-meta">Line {{ result.line }}</div>
                      }
                      @if (result.value) {
                        <div class="result-value mono">{{ result.value }}</div>
                      }
                    </div>
                  }
                </div>
              </div>
            } @else if (scanComplete()) {
              <div class="empty-state success-state">No secrets detected.</div>
            }

            <!-- Redacted output -->
            @if (redactedOutput()) {
              <div class="redacted-section">
                <div class="results-title">Redacted output</div>
                <textarea class="scan-textarea redacted" readonly [value]="redactedOutput()"></textarea>
              </div>
            }
          </div>
        }

        <!-- ── Tab 3: Environment Security ───────────────────────────────── -->
        @if (activeTab() === 'environment') {
          <div class="env-tab">
            <div class="env-top">

              <!-- Safe env vars table -->
              <div class="env-card">
                <div class="env-card-header">
                  <span class="env-card-title">Safe Environment Variables</span>
                  <button class="btn" type="button" (click)="loadSafeEnv()">Reload</button>
                </div>

                @if (envVars().length > 0) {
                  <div class="table-wrapper">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Value</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (envVar of envVars(); track envVar.name) {
                          <tr>
                            <td class="mono">{{ envVar.name }}</td>
                            <td class="mono muted">{{ maskValue(envVar.value) }}</td>
                            <td>
                              <span class="badge" [class]="envVar.allowed ? 'badge-info' : 'badge-error'">
                                {{ envVar.allowed ? 'allowed' : 'blocked' }}
                              </span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <div class="empty-state">No environment variables loaded.</div>
                }
              </div>

              <!-- Test single var -->
              <div class="env-card">
                <div class="env-card-title">Test Variable</div>
                <div class="test-row">
                  <input
                    class="filter-input flex-1"
                    type="text"
                    placeholder="VAR_NAME"
                    [value]="testVarName()"
                    (input)="onTestVarNameInput($event)"
                  />
                  <input
                    class="filter-input flex-1"
                    type="text"
                    placeholder="value"
                    [value]="testVarValue()"
                    (input)="onTestVarValueInput($event)"
                  />
                  <button
                    class="btn primary"
                    type="button"
                    [disabled]="testVarName().trim().length === 0"
                    (click)="checkEnvVar()"
                  >
                    Check
                  </button>
                </div>

                @if (testVarResult()) {
                  <div class="test-result" [class.test-ok]="testVarAllowed()" [class.test-fail]="!testVarAllowed()">
                    {{ testVarResult() }}
                  </div>
                }
              </div>
            </div>

            <!-- Filter config panel -->
            <div class="env-card">
              <div class="env-card-header">
                <span class="env-card-title">Filter Configuration</span>
                <button class="btn" type="button" (click)="loadFilterConfig()">Reload</button>
              </div>
              @if (filterConfig()) {
                <pre class="json-panel">{{ filterConfig() }}</pre>
              } @else {
                <div class="empty-state">Filter config not loaded.</div>
              }
            </div>
          </div>
        }

      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        width: 100%;
        height: 100%;
        flex: 1;
      }

      .security-page {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        height: 100%;
        padding: var(--spacing-lg);
        background: var(--bg-primary);
        color: var(--text-primary);
        width: 100%;
        overflow: hidden;
      }

      /* ── Header ─────────────────────────────────────────────────────────── */

      .page-header {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        flex-shrink: 0;
      }

      .header-btn {
        padding: var(--spacing-xs) var(--spacing-md);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 13px;
      }

      .header-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .refresh-btn {
        margin-left: auto;
      }

      .header-title {
        display: flex;
        flex-direction: column;
      }

      .title {
        font-size: 18px;
        font-weight: 700;
      }

      .subtitle {
        font-size: 12px;
        color: var(--text-muted);
      }

      /* ── Tabs ────────────────────────────────────────────────────────────── */

      .tab-bar {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
      }

      .tab-btn {
        padding: var(--spacing-xs) var(--spacing-md);
        border: none;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 13px;
        transition: color 0.15s, border-color 0.15s;
      }

      .tab-btn.active {
        color: var(--text-primary);
        border-bottom-color: var(--primary-color);
      }

      .tab-btn:hover:not(.active) {
        color: var(--text-secondary);
      }

      /* ── Error / empty states ────────────────────────────────────────────── */

      .error-banner {
        padding: var(--spacing-sm) var(--spacing-md);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--error-color) 15%, transparent);
        border: 1px solid var(--error-color);
        color: var(--error-color);
        font-size: 13px;
        flex-shrink: 0;
      }

      .empty-state {
        padding: var(--spacing-lg);
        text-align: center;
        color: var(--text-muted);
        font-size: 13px;
      }

      .success-state {
        color: var(--success-color);
      }

      /* ── Tab content wrapper ─────────────────────────────────────────────── */

      .tab-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }

      /* ── Common UI elements ──────────────────────────────────────────────── */

      .filter-bar {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) 0;
        flex-wrap: wrap;
      }

      .filter-label {
        font-size: 12px;
        color: var(--text-muted);
        white-space: nowrap;
      }

      .filter-select {
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 13px;
      }

      .filter-input {
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 13px;
        width: 80px;
      }

      .filter-spacer {
        flex: 1;
      }

      .btn {
        padding: var(--spacing-xs) var(--spacing-md);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn.primary {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: #000;
        font-weight: 600;
      }

      .btn.danger {
        border-color: var(--error-color);
        color: var(--error-color);
      }

      .btn.danger:hover {
        background: color-mix(in srgb, var(--error-color) 15%, transparent);
      }

      /* ── Badges ──────────────────────────────────────────────────────────── */

      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .badge-info {
        background: color-mix(in srgb, #3b82f6 20%, transparent);
        color: #60a5fa;
        border: 1px solid #3b82f6;
      }

      .badge-warning {
        background: color-mix(in srgb, var(--warning-color) 20%, transparent);
        color: var(--warning-color);
        border: 1px solid var(--warning-color);
      }

      .badge-error {
        background: color-mix(in srgb, var(--error-color) 20%, transparent);
        color: var(--error-color);
        border: 1px solid var(--error-color);
      }

      /* ── Table ───────────────────────────────────────────────────────────── */

      .table-wrapper {
        overflow-x: auto;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .data-table th {
        padding: var(--spacing-xs) var(--spacing-sm);
        text-align: left;
        color: var(--text-muted);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
      }

      .data-table td {
        padding: var(--spacing-xs) var(--spacing-sm);
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
      }

      .data-table tr:last-child td {
        border-bottom: none;
      }

      .data-table tr:hover td {
        background: var(--bg-tertiary);
      }

      .mono {
        font-family: var(--font-family-mono, monospace);
        font-size: 12px;
      }

      .muted {
        color: var(--text-muted);
      }

      /* ── Audit tab ───────────────────────────────────────────────────────── */

      .audit-tab {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      /* ── Scanner tab ─────────────────────────────────────────────────────── */

      .scanner-tab {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .scanner-controls {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
      }

      .field-label {
        font-size: 12px;
        color: var(--text-muted);
      }

      .scan-textarea {
        width: 100%;
        min-height: 140px;
        padding: var(--spacing-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 13px;
        font-family: var(--font-family-mono, monospace);
        resize: vertical;
        box-sizing: border-box;
      }

      .scan-textarea.redacted {
        color: var(--text-muted);
        min-height: 100px;
      }

      .scanner-row {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        flex-wrap: wrap;
      }

      .results-section,
      .redacted-section {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
      }

      .results-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary);
      }

      .results-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--spacing-sm);
      }

      .result-card {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
        padding: var(--spacing-sm);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
      }

      .result-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--spacing-xs);
      }

      .result-type {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .result-meta {
        font-size: 11px;
        color: var(--text-muted);
      }

      .result-value {
        font-size: 11px;
        color: var(--text-secondary);
        word-break: break-all;
      }

      /* ── Environment tab ─────────────────────────────────────────────────── */

      .env-tab {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .env-top {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
        gap: var(--spacing-md);
      }

      .env-card {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
        padding: var(--spacing-md);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .env-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--spacing-sm);
      }

      .env-card-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .test-row {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
        flex-wrap: wrap;
      }

      .flex-1 {
        flex: 1;
        min-width: 100px;
      }

      .test-result {
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-weight: 500;
      }

      .test-ok {
        background: color-mix(in srgb, var(--success-color) 15%, transparent);
        color: var(--success-color);
        border: 1px solid var(--success-color);
      }

      .test-fail {
        background: color-mix(in srgb, var(--error-color) 15%, transparent);
        color: var(--error-color);
        border: 1px solid var(--error-color);
      }

      .json-panel {
        padding: var(--spacing-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: 12px;
        font-family: var(--font-family-mono, monospace);
        overflow-x: auto;
        white-space: pre;
        margin: 0;
      }

      @media (max-width: 900px) {
        .env-top {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class SecurityPageComponent implements OnInit {
  private readonly security = inject(SecurityIpcService);
  private readonly router = inject(Router);

  // ── Tab state ──────────────────────────────────────────────────────────────

  readonly activeTab = signal<'audit' | 'scanner' | 'environment'>('audit');

  // ── Global state ───────────────────────────────────────────────────────────

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  // ── Audit log state ────────────────────────────────────────────────────────

  readonly auditEntries = signal<AuditEntry[]>([]);
  readonly auditSeverityFilter = signal<'all' | 'info' | 'warning' | 'error'>('all');
  readonly auditLimit = signal(100);

  readonly filteredAuditEntries = computed(() => {
    const filter = this.auditSeverityFilter();
    return filter === 'all'
      ? this.auditEntries()
      : this.auditEntries().filter(e => e.severity === filter);
  });

  // ── Scanner state ──────────────────────────────────────────────────────────

  readonly scanContent = signal('');
  readonly scanContentType = signal<'auto' | 'env' | 'text'>('auto');
  readonly scanning = signal(false);
  readonly scanResults = signal<SecretResult[]>([]);
  readonly scanComplete = signal(false);
  readonly redactedOutput = signal('');

  // ── Environment state ──────────────────────────────────────────────────────

  readonly envVars = signal<EnvVar[]>([]);
  readonly testVarName = signal('');
  readonly testVarValue = signal('');
  readonly testVarResult = signal('');
  readonly testVarAllowed = signal(false);
  readonly filterConfig = signal('');

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadAuditLog();
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/']);
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────

  switchTab(tab: 'audit' | 'scanner' | 'environment'): void {
    this.activeTab.set(tab);
    this.errorMessage.set('');

    if (tab === 'audit') {
      this.loadAuditLog();
    } else if (tab === 'environment') {
      this.loadSafeEnv();
      this.loadFilterConfig();
    }
  }

  refresh(): void {
    const tab = this.activeTab();
    if (tab === 'audit') {
      this.loadAuditLog();
    } else if (tab === 'environment') {
      this.loadSafeEnv();
      this.loadFilterConfig();
    }
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

  async loadAuditLog(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const response = await this.security.securityGetAuditLog(undefined, this.auditLimit());
      const entries = this.unwrapData<AuditEntry[]>(response, []);
      this.auditEntries.set(entries);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      this.loading.set(false);
    }
  }

  async clearAuditLog(): Promise<void> {
    this.errorMessage.set('');
    try {
      await this.security.securityClearAuditLog();
      this.auditEntries.set([]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to clear audit log');
    }
  }

  onSeverityFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.auditSeverityFilter.set(target.value as 'all' | 'info' | 'warning' | 'error');
  }

  onLimitChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!isNaN(value) && value > 0) {
      this.auditLimit.set(value);
      this.loadAuditLog();
    }
  }

  exportAuditCsv(): void {
    const entries = this.auditEntries();
    const csv = ['timestamp,action,instanceId,target,severity']
      .concat(
        entries.map(
          e =>
            `${new Date(e.timestamp).toISOString()},${e.action},${e.instanceId || ''},${e.target || ''},${e.severity}`
        )
      )
      .join('\n');
    this.downloadFile('audit-log.csv', csv, 'text/csv');
  }

  // ─── Secret scanner ────────────────────────────────────────────────────────

  async scanForSecrets(): Promise<void> {
    const content = this.scanContent().trim();
    if (!content) return;

    this.scanning.set(true);
    this.errorMessage.set('');
    this.scanResults.set([]);
    this.scanComplete.set(false);
    this.redactedOutput.set('');

    try {
      const response = await this.security.securityDetectSecrets(content, this.scanContentType());
      const results = this.unwrapData<SecretResult[]>(response, []);
      this.scanResults.set(results);
      this.scanComplete.set(true);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      this.scanning.set(false);
    }
  }

  async redactContent(): Promise<void> {
    const content = this.scanContent().trim();
    if (!content) return;

    this.scanning.set(true);
    this.errorMessage.set('');
    this.redactedOutput.set('');

    try {
      const response = await this.security.securityRedactContent(content, this.scanContentType());
      const redacted = this.unwrapData<string>(response, '');
      this.redactedOutput.set(redacted);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Redaction failed');
    } finally {
      this.scanning.set(false);
    }
  }

  onScanContentInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.scanContent.set(target.value);
    // Reset results when content changes
    this.scanComplete.set(false);
    this.scanResults.set([]);
    this.redactedOutput.set('');
  }

  onContentTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.scanContentType.set(target.value as 'auto' | 'env' | 'text');
  }

  // ─── Environment ───────────────────────────────────────────────────────────

  async loadSafeEnv(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const response = await this.security.securityGetSafeEnv();
      const raw = this.unwrapData<Record<string, string> | EnvVar[]>(response, {});

      // Normalize: backend may return a flat record or an array
      if (Array.isArray(raw)) {
        this.envVars.set(raw);
      } else {
        const vars: EnvVar[] = Object.entries(raw).map(([name, value]) => ({
          name,
          value: String(value),
          allowed: true
        }));
        this.envVars.set(vars);
      }
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to load environment');
    } finally {
      this.loading.set(false);
    }
  }

  async loadFilterConfig(): Promise<void> {
    this.errorMessage.set('');
    try {
      const response = await this.security.securityGetEnvFilterConfig();
      const config = this.unwrapData<unknown>(response, null);
      this.filterConfig.set(config != null ? JSON.stringify(config, null, 2) : '');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to load filter config');
    }
  }

  async checkEnvVar(): Promise<void> {
    const name = this.testVarName().trim();
    const value = this.testVarValue();
    if (!name) return;

    this.errorMessage.set('');
    this.testVarResult.set('');

    try {
      const response = await this.security.securityCheckEnvVar(name, value);
      const result = this.unwrapData<{ allowed: boolean; reason?: string }>(response, { allowed: false });
      this.testVarAllowed.set(result.allowed);
      this.testVarResult.set(
        result.allowed
          ? `${name} is allowed`
          : `${name} is blocked${result.reason ? ': ' + result.reason : ''}`
      );
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Check failed');
    }
  }

  onTestVarNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.testVarName.set(target.value);
    this.testVarResult.set('');
  }

  onTestVarValueInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.testVarValue.set(target.value);
    this.testVarResult.set('');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  formatTimestamp(ts: number): string {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
  }

  maskValue(value: string): string {
    if (!value || value.length <= 4) return '****';
    return value.slice(0, 2) + '****' + value.slice(-2);
  }

  getSeverityClass(severity: string): string {
    const s = severity?.toLowerCase();
    if (s === 'error' || s === 'high' || s === 'critical') return 'badge-error';
    if (s === 'warning' || s === 'medium') return 'badge-warning';
    return 'badge-info';
  }

  private unwrapData<T>(response: IpcResponse, fallback: T): T {
    return response.success ? ((response.data as T) ?? fallback) : fallback;
  }

  private downloadFile(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
