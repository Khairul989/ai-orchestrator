/**
 * Active Files Display Component
 *
 * Phase 7 UI/UX Improvement: Shows currently loaded context files
 * - File paths with cache status indicators
 * - Token count per file
 * - Load time and source information
 * - Color coding: cached (green), loaded (blue), pending (gray)
 */

import { Component, inject, signal, effect, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

// Helper to access API from preload
const getApi = () => (window as any).electronAPI;

export interface ActiveFile {
  id: string;
  type: 'file' | 'url' | 'query' | 'memory' | 'tool_output';
  path: string;
  tokens: number;
  loadedAt: number;
  loadDurationMs: number;
  source: 'cache' | 'disk' | 'network' | 'memory';
  metadata?: {
    language?: string;
    mimeType?: string;
    checksum?: string;
  };
}

export interface ContextStats {
  totalFiles: number;
  totalTokens: number;
  cacheHits: number;
  cacheMisses: number;
  averageLoadTime: number;
}

@Component({
  selector: 'app-active-files',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="active-files-container" [class.expanded]="expanded()">
      <!-- Header with toggle and summary -->
      <div class="header" (click)="toggleExpanded()">
        <div class="header-left">
          <span class="toggle-icon" [class.expanded]="expanded()">&#9656;</span>
          <span class="title">Active Context</span>
          <span class="badge">{{ files().length }} files</span>
        </div>
        <div class="header-right">
          <span class="token-summary">{{ formatTokens(totalTokens()) }} tokens</span>
          <button
            class="refresh-btn"
            (click)="refresh($event)"
            [disabled]="loading()"
            title="Refresh"
          >
            &#8635;
          </button>
        </div>
      </div>

      <!-- Expanded content -->
      @if (expanded()) {
        <div class="content">
          <!-- Stats bar -->
          <div class="stats-bar">
            <div class="stat">
              <span class="stat-value">{{ stats().cacheHits }}</span>
              <span class="stat-label">Cache Hits</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ stats().cacheMisses }}</span>
              <span class="stat-label">Cache Misses</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ stats().averageLoadTime.toFixed(0) }}ms</span>
              <span class="stat-label">Avg Load</span>
            </div>
          </div>

          <!-- Sort controls -->
          <div class="sort-controls">
            <button
              class="sort-btn"
              [class.active]="sortBy() === 'time'"
              (click)="sortBy.set('time')"
            >
              Recent
            </button>
            <button
              class="sort-btn"
              [class.active]="sortBy() === 'tokens'"
              (click)="sortBy.set('tokens')"
            >
              Tokens
            </button>
            <button
              class="sort-btn"
              [class.active]="sortBy() === 'type'"
              (click)="sortBy.set('type')"
            >
              Type
            </button>
          </div>

          <!-- File list -->
          @if (loading()) {
            <div class="loading">Loading...</div>
          } @else if (sortedFiles().length === 0) {
            <div class="empty">No files loaded in context</div>
          } @else {
            <div class="file-list">
              @for (file of sortedFiles(); track file.id) {
                <div
                  class="file-row"
                  [class.cached]="file.source === 'cache'"
                  [class.loaded]="file.source === 'disk' || file.source === 'network'"
                  [class.memory]="file.source === 'memory'"
                  (click)="selectFile(file)"
                >
                  <div class="file-icon">
                    @switch (file.type) {
                      @case ('file') {
                        <span>&#128196;</span>
                      }
                      @case ('url') {
                        <span>&#127760;</span>
                      }
                      @case ('query') {
                        <span>&#128269;</span>
                      }
                      @case ('memory') {
                        <span>&#128279;</span>
                      }
                      @case ('tool_output') {
                        <span>&#9881;</span>
                      }
                    }
                  </div>

                  <div class="file-info">
                    <div class="file-path" [title]="file.path">
                      {{ getFileName(file.path) }}
                    </div>
                    <div class="file-meta">
                      @if (file.metadata?.language) {
                        <span class="language">{{ file.metadata?.language }}</span>
                      }
                      <span class="source" [class]="file.source">
                        {{ file.source }}
                      </span>
                      <span class="load-time">{{ file.loadDurationMs }}ms</span>
                    </div>
                  </div>

                  <div class="file-tokens">
                    <span class="token-count">{{ formatTokens(file.tokens) }}</span>
                    <span class="token-label">tokens</span>
                  </div>

                  <button
                    class="remove-btn"
                    (click)="removeFile($event, file)"
                    title="Remove from context"
                  >
                    &#10005;
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .active-files-container {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-sm) var(--spacing-md);
        cursor: pointer;
        user-select: none;
        transition: background var(--transition-fast);

        &:hover {
          background: var(--bg-tertiary);
        }
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }

      .toggle-icon {
        font-size: 10px;
        color: var(--text-muted);
        transition: transform 0.2s ease;

        &.expanded {
          transform: rotate(90deg);
        }
      }

      .title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .badge {
        padding: 2px 8px;
        background: var(--bg-tertiary);
        border-radius: 999px;
        font-size: 11px;
        color: var(--text-secondary);
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }

      .token-summary {
        font-size: 12px;
        color: var(--text-muted);
        font-family: monospace;
      }

      .refresh-btn {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-size: 14px;

        &:hover:not(:disabled) {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        &:disabled {
          opacity: 0.5;
        }
      }

      .content {
        border-top: 1px solid var(--border-color);
        padding: var(--spacing-sm);
      }

      .stats-bar {
        display: flex;
        gap: var(--spacing-md);
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
        margin-bottom: var(--spacing-sm);
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
      }

      .stat-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .stat-label {
        font-size: 10px;
        color: var(--text-muted);
      }

      .sort-controls {
        display: flex;
        gap: var(--spacing-xs);
        margin-bottom: var(--spacing-sm);
      }

      .sort-btn {
        padding: var(--spacing-xs) var(--spacing-sm);
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 11px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--bg-primary);
        }

        &.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }
      }

      .loading,
      .empty {
        padding: var(--spacing-lg);
        text-align: center;
        color: var(--text-muted);
        font-size: 12px;
      }

      .file-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 300px;
        overflow-y: auto;
      }

      .file-row {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background var(--transition-fast);
        border-left: 3px solid transparent;

        &:hover {
          background: var(--bg-tertiary);

          .remove-btn {
            opacity: 1;
          }
        }

        &.cached {
          border-left-color: var(--success-color);
        }

        &.loaded {
          border-left-color: var(--primary-color);
        }

        &.memory {
          border-left-color: var(--warning-color);
        }
      }

      .file-icon {
        font-size: 14px;
        width: 20px;
        text-align: center;
        flex-shrink: 0;
      }

      .file-info {
        flex: 1;
        min-width: 0;
      }

      .file-path {
        font-size: 12px;
        font-family: monospace;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-meta {
        display: flex;
        gap: var(--spacing-xs);
        margin-top: 2px;
      }

      .language,
      .source,
      .load-time {
        font-size: 10px;
        padding: 1px 4px;
        border-radius: 3px;
        background: var(--bg-tertiary);
        color: var(--text-muted);
      }

      .source {
        &.cache {
          background: rgba(46, 204, 113, 0.2);
          color: var(--success-color);
        }

        &.disk,
        &.network {
          background: rgba(52, 152, 219, 0.2);
          color: var(--primary-color);
        }

        &.memory {
          background: rgba(241, 196, 15, 0.2);
          color: var(--warning-color);
        }
      }

      .file-tokens {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
      }

      .token-count {
        font-size: 12px;
        font-weight: 500;
        font-family: monospace;
        color: var(--text-primary);
      }

      .token-label {
        font-size: 9px;
        color: var(--text-muted);
      }

      .remove-btn {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-size: 10px;
        opacity: 0;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--error-color);
          color: white;
        }
      }
    `,
  ],
})
export class ActiveFilesComponent {
  instanceId = input<string>();
  fileSelected = output<ActiveFile>();

  loading = signal(false);
  expanded = signal(false);
  files = signal<ActiveFile[]>([]);
  sortBy = signal<'time' | 'tokens' | 'type'>('time');

  totalTokens = computed(() =>
    this.files().reduce((sum, f) => sum + f.tokens, 0)
  );

  stats = computed<ContextStats>(() => {
    const allFiles = this.files();
    const cacheHits = allFiles.filter((f) => f.source === 'cache').length;
    const totalLoadTime = allFiles.reduce((sum, f) => sum + f.loadDurationMs, 0);

    return {
      totalFiles: allFiles.length,
      totalTokens: this.totalTokens(),
      cacheHits,
      cacheMisses: allFiles.length - cacheHits,
      averageLoadTime: allFiles.length > 0 ? totalLoadTime / allFiles.length : 0,
    };
  });

  sortedFiles = computed(() => {
    const sorted = [...this.files()];
    const sort = this.sortBy();

    switch (sort) {
      case 'time':
        return sorted.sort((a, b) => b.loadedAt - a.loadedAt);
      case 'tokens':
        return sorted.sort((a, b) => b.tokens - a.tokens);
      case 'type':
        return sorted.sort((a, b) => a.type.localeCompare(b.type));
      default:
        return sorted;
    }
  });

  private initialized = false;

  constructor() {
    effect(() => {
      if (!this.initialized) {
        this.initialized = true;
        void this.loadFiles();
      }
    });
  }

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
    if (this.expanded() && this.files().length === 0) {
      void this.loadFiles();
    }
  }

  async refresh(event: Event): Promise<void> {
    event.stopPropagation();
    await this.loadFiles();
  }

  async loadFiles(): Promise<void> {
    const api = getApi();
    if (!api?.contextGetActiveFiles) return;

    this.loading.set(true);
    try {
      const response = await api.contextGetActiveFiles({
        instanceId: this.instanceId(),
      });
      if (response.success) {
        this.files.set(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load active files:', error);
    } finally {
      this.loading.set(false);
    }
  }

  selectFile(file: ActiveFile): void {
    this.fileSelected.emit(file);
  }

  async removeFile(event: Event, file: ActiveFile): Promise<void> {
    event.stopPropagation();

    const api = getApi();
    if (!api?.contextRemoveFile) return;

    try {
      const response = await api.contextRemoveFile({
        instanceId: this.instanceId(),
        fileId: file.id,
      });
      if (response.success) {
        this.files.update((files) => files.filter((f) => f.id !== file.id));
      }
    } catch (error) {
      console.error('Failed to remove file:', error);
    }
  }

  getFileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }

  formatTokens(count: number): string {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  }
}
