/**
 * Advanced Settings Tab Component - Advanced options, hook approvals, setup guides
 */

import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { SettingsStore } from '../../core/state/settings.store';
import { SettingRowComponent } from './setting-row.component';
import type { AppSettings } from '../../../../shared/types/settings.types';

// Helper to access API from preload
const getApi = (): {
  hooksApprovalsList?: (params: { pendingOnly: boolean }) => Promise<{ success: boolean; data?: unknown; error?: { message: string } }>;
  hooksApprovalsUpdate?: (params: { hookId: string; approved: boolean }) => Promise<{ success: boolean; error?: { message: string } }>;
  hooksApprovalsClear?: () => Promise<{ success: boolean; error?: { message: string } }>;
  openDocsFile?: (filename: string) => Promise<{ success: boolean; error?: { message: string } }>;
} => (window as unknown as Record<string, unknown>)['electronAPI'] as ReturnType<typeof getApi>;

interface HookApprovalSummary {
  id: string;
  name: string;
  event: string;
  enabled: boolean;
  approvalRequired: boolean;
  approved: boolean;
  handlerType: string;
  handlerSummary?: string;
}

@Component({
  selector: 'app-advanced-settings-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [SettingRowComponent],
  template: `
    @for (setting of store.advancedSettings(); track setting.key) {
      <app-setting-row
        [setting]="setting"
        [value]="store.get(setting.key)"
        (valueChange)="onSettingChange($event)"
      />
    }

    <!-- Hook Approvals Section -->
    <div class="setting-row hook-approvals-header">
      <div class="setting-info">
        <h3 class="setting-label">Hook Approvals</h3>
        <p class="setting-description">
          Review hooks that require approval before they run and manage
          remembered approvals.
        </p>
      </div>
      <div class="setting-control button-group">
        <button
          class="btn-secondary"
          (click)="loadHookApprovals()"
          [disabled]="hookApprovalsLoading()"
        >
          Refresh
        </button>
        <button
          class="btn-secondary"
          (click)="clearHookApprovals()"
          [disabled]="hookApprovalsLoading()"
        >
          Clear All
        </button>
      </div>
    </div>

    <div class="hook-approvals-list">
      @if (hookApprovalsLoading()) {
        <div class="hook-approvals-empty">Loading approvals...</div>
      } @else if (hookApprovalsError()) {
        <div class="hook-approvals-empty error">
          {{ hookApprovalsError() }}
        </div>
      } @else if (hookApprovals().length === 0) {
        <div class="hook-approvals-empty">No hook approvals to review.</div>
      } @else {
        @for (hook of hookApprovals(); track hook.id) {
          <div class="hook-approval-row">
            <div class="hook-approval-info">
              <div class="hook-approval-title">
                <span class="hook-name">{{ hook.name }}</span>
                <span class="hook-event">{{ hook.event }}</span>
              </div>
              <div class="hook-approval-meta">
                <span class="hook-status" [class.approved]="hook.approved">
                  {{ hook.approved ? 'Approved' : 'Pending' }}
                </span>
                <span class="hook-type">{{ hook.handlerType }}</span>
                @if (hook.handlerSummary) {
                  <span class="hook-summary">{{ hook.handlerSummary }}</span>
                }
              </div>
            </div>
            <div class="hook-approval-actions">
              @if (hook.approved) {
                <button
                  class="btn-secondary"
                  (click)="updateHookApproval(hook.id, false)"
                  [disabled]="hookApprovalsLoading()"
                >
                  Revoke
                </button>
              } @else {
                <button
                  class="btn-primary"
                  (click)="updateHookApproval(hook.id, true)"
                  [disabled]="hookApprovalsLoading()"
                >
                  Approve
                </button>
              }
            </div>
          </div>
        }
      }
    </div>

    <!-- Setup Guides -->
    <div class="setup-guides-section">
      <h4>Setup Guides</h4>
      <div class="guide-links">
        <button
          class="guide-link"
          (click)="openDocsFile('BROWSER_AUTOMATION_SETUP.md')"
          title="Learn how to enable browser automation for child instances"
        >
          <span class="guide-icon">🌐</span>
          <span class="guide-text">
            <span class="guide-title">Browser Automation</span>
            <span class="guide-desc"
              >Enable Chrome DevTools MCP for child instances</span
            >
          </span>
        </button>
      </div>
    </div>

    <!-- Future Settings Note -->
    <div class="future-settings-note">
      <h4>Coming Soon</h4>
      <ul>
        <li>Session auto-save/restore</li>
        <li>Notification preferences</li>
        <li>Export/import settings</li>
        <li>Per-project settings</li>
      </ul>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .setting-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--spacing-lg);
        padding: var(--spacing-md);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
      }

      .setting-info {
        flex: 1;
      }

      .setting-label {
        display: block;
        font-weight: 500;
        margin-bottom: var(--spacing-xs);
        color: var(--text-primary);
      }

      .setting-description {
        margin: 0;
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.4;
      }

      .setting-control {
        flex-shrink: 0;
        min-width: 150px;
      }

      .button-group {
        display: flex;
        gap: var(--spacing-xs);
        align-items: center;
        min-width: auto;
      }

      .btn-secondary,
      .btn-primary {
        padding: var(--spacing-xs) var(--spacing-md);
        border-radius: var(--radius-sm);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
        border: 1px solid transparent;
        white-space: nowrap;
      }

      .btn-secondary {
        background: var(--bg-tertiary);
        border-color: var(--border-color);
        color: var(--text-primary);

        &:hover:not(:disabled) {
          background: var(--bg-primary);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .btn-primary {
        background: var(--primary-color);
        color: white;

        &:hover:not(:disabled) {
          background: var(--primary-hover);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .hook-approvals-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
      }

      .hook-approvals-empty {
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        color: var(--text-secondary);
        font-size: 12px;
      }

      .hook-approvals-empty.error {
        color: var(--error-color);
        border: 1px solid var(--error-color);
        background: rgba(255, 0, 0, 0.05);
      }

      .hook-approval-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--spacing-md);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
      }

      .hook-approval-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex: 1;
      }

      .hook-approval-title {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
        flex-wrap: wrap;
      }

      .hook-name {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 13px;
      }

      .hook-event {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }

      .hook-approval-meta {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
        flex-wrap: wrap;
        font-size: 11px;
        color: var(--text-secondary);
      }

      .hook-status {
        padding: 2px 6px;
        border-radius: 999px;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
      }

      .hook-status.approved {
        background: rgba(46, 204, 113, 0.15);
        color: #2ecc71;
        border-color: rgba(46, 204, 113, 0.35);
      }

      .hook-summary {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .hook-approval-actions {
        display: flex;
        gap: var(--spacing-xs);
        flex-shrink: 0;
      }

      /* Setup Guides Section */
      .setup-guides-section {
        margin-top: var(--spacing-lg);
        padding: var(--spacing-md);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);

        h4 {
          margin: 0 0 var(--spacing-sm);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
      }

      .guide-links {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
      }

      .guide-link {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
        text-align: left;

        &:hover {
          background: var(--bg-primary);
          border-color: var(--primary-color);
        }
      }

      .guide-icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .guide-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .guide-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .guide-desc {
        font-size: 11px;
        color: var(--text-secondary);
      }

      /* Future Settings Note */
      .future-settings-note {
        margin-top: var(--spacing-lg);
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        border: 1px dashed var(--border-color);

        h4 {
          margin: 0 0 var(--spacing-sm);
          font-size: 14px;
          color: var(--text-secondary);
        }

        ul {
          margin: 0;
          padding-left: var(--spacing-lg);
          color: var(--text-muted);
          font-size: 13px;
        }

        li {
          margin-bottom: var(--spacing-xs);
        }
      }
    `
  ]
})
export class AdvancedSettingsTabComponent {
  store = inject(SettingsStore);

  hookApprovals = signal<HookApprovalSummary[]>([]);
  hookApprovalsLoading = signal(false);
  hookApprovalsError = signal<string | null>(null);

  private initialized = false;

  constructor() {
    // Load hook approvals on first render
    effect(() => {
      if (!this.initialized) {
        this.initialized = true;
        void this.loadHookApprovals();
      }
    });
  }

  onSettingChange(event: { key: string; value: unknown }): void {
    this.store.set(event.key as keyof AppSettings, event.value as AppSettings[keyof AppSettings]);
  }

  async loadHookApprovals(): Promise<void> {
    const api = getApi();
    if (!api?.hooksApprovalsList) return;

    this.hookApprovalsLoading.set(true);
    this.hookApprovalsError.set(null);
    try {
      const response = await api.hooksApprovalsList({ pendingOnly: false });
      if (response.success) {
        this.hookApprovals.set((response.data || []) as HookApprovalSummary[]);
      } else {
        this.hookApprovalsError.set(
          response.error?.message || 'Failed to load approvals'
        );
      }
    } catch (error) {
      this.hookApprovalsError.set((error as Error).message);
    } finally {
      this.hookApprovalsLoading.set(false);
    }
  }

  async updateHookApproval(hookId: string, approved: boolean): Promise<void> {
    const api = getApi();
    if (!api?.hooksApprovalsUpdate) return;

    this.hookApprovalsLoading.set(true);
    this.hookApprovalsError.set(null);
    try {
      const response = await api.hooksApprovalsUpdate({ hookId, approved });
      if (response.success) {
        await this.loadHookApprovals();
      } else {
        this.hookApprovalsError.set(
          response.error?.message || 'Failed to update approval'
        );
      }
    } catch (error) {
      this.hookApprovalsError.set((error as Error).message);
    } finally {
      this.hookApprovalsLoading.set(false);
    }
  }

  async clearHookApprovals(): Promise<void> {
    const api = getApi();
    if (!api?.hooksApprovalsClear) return;

    this.hookApprovalsLoading.set(true);
    this.hookApprovalsError.set(null);
    try {
      const response = await api.hooksApprovalsClear();
      if (response.success) {
        await this.loadHookApprovals();
      } else {
        this.hookApprovalsError.set(
          response.error?.message || 'Failed to clear approvals'
        );
      }
    } catch (error) {
      this.hookApprovalsError.set((error as Error).message);
    } finally {
      this.hookApprovalsLoading.set(false);
    }
  }

  async openDocsFile(filename: string): Promise<void> {
    const api = getApi();
    if (!api?.openDocsFile) {
      console.warn('API not available for opening docs');
      return;
    }

    try {
      const result = await api.openDocsFile(filename);
      if (!result.success) {
        console.error('Failed to open docs file:', result.error?.message);
      }
    } catch (error) {
      console.error('Failed to open docs file:', error);
    }
  }
}
