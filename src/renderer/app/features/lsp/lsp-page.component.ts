/**
 * LSP Page
 * Language Server Protocol integration — definitions, references, symbols, and diagnostics.
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
import { LspIpcService } from '../../core/services/ipc/lsp-ipc.service';
import type { IpcResponse } from '../../core/services/ipc/electron-ipc.service';

// ============================================================
// Local interfaces
// ============================================================

interface LspServer {
  id: string;
  name: string;
  languages: string[];
  status: 'running' | 'stopped' | 'error';
}

interface DocumentSymbol {
  name: string;
  kind: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: DocumentSymbol[];
}

interface DiagnosticItem {
  line: number;
  character: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
}

interface LocationItem {
  filePath: string;
  line: number;
  character: number;
  preview?: string;
}

// ============================================================
// Symbol kind icon map
// ============================================================

const SYMBOL_KIND_ICONS: Record<string, string> = {
  File: 'F',
  Module: 'M',
  Namespace: 'N',
  Package: 'P',
  Class: 'C',
  Method: 'm',
  Property: 'p',
  Field: 'f',
  Constructor: 'c',
  Enum: 'E',
  Interface: 'I',
  Function: 'fn',
  Variable: 'v',
  Constant: 'K',
  String: 's',
  Number: '#',
  Boolean: 'b',
  Array: 'A',
  Object: 'O',
  Key: 'k',
  Null: '∅',
  EnumMember: 'e',
  Struct: 'S',
  Event: 'ev',
  Operator: 'op',
  TypeParameter: 'T',
};

function symbolKindIcon(kind: string): string {
  return SYMBOL_KIND_ICONS[kind] ?? '?';
}

@Component({
  selector: 'app-lsp-page',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">

      <!-- ===== Page Header ===== -->
      <div class="page-header">
        <button class="header-btn" type="button" (click)="goBack()">← Back</button>
        <div class="header-title">
          <span class="title">LSP Integration</span>
          <span class="subtitle">Language server protocol - definitions, references, symbols, and diagnostics</span>
        </div>
        <div class="header-actions">
          <button class="btn" type="button" [disabled]="working()" (click)="refresh()">
            {{ working() ? 'Loading…' : 'Refresh' }}
          </button>
          <button class="btn danger-btn" type="button" [disabled]="working()" (click)="shutdown()">
            Shutdown LSP
          </button>
        </div>
      </div>

      <!-- ===== Error / Info banners ===== -->
      @if (errorMessage()) {
        <div class="error-banner">{{ errorMessage() }}</div>
      }
      @if (infoMessage()) {
        <div class="info-banner">{{ infoMessage() }}</div>
      }

      <!-- ===== Server Status Bar ===== -->
      <div class="status-bar">
        <span class="status-bar-label">Servers:</span>
        @if (servers().length === 0) {
          <span class="status-muted">No servers detected</span>
        }
        @for (server of servers(); track server.id) {
          <span class="server-badge" [class]="'badge-' + server.status">
            <span class="badge-dot"></span>
            {{ server.name }}
            <span class="badge-langs">{{ server.languages.join(', ') }}</span>
          </span>
        }
      </div>

      <!-- ===== 3-Column Main Layout ===== -->
      <div class="main-grid">

        <!-- ---- Left: Symbol Tree ---- -->
        <div class="panel panel-left">
          <div class="panel-title">Symbol Tree</div>

          <div class="input-row">
            <input
              class="input"
              type="text"
              placeholder="File path…"
              [value]="symbolFilePath()"
              (input)="onSymbolFilePathInput($event)"
            />
            <button
              class="btn"
              type="button"
              [disabled]="working() || !symbolFilePath()"
              (click)="loadDocumentSymbols()"
            >
              Load
            </button>
          </div>

          @if (symbolsLoading()) {
            <div class="loading-text">Loading symbols…</div>
          } @else if (documentSymbols().length > 0) {
            <div class="symbol-tree">
              @for (sym of documentSymbols(); track sym.name + sym.range.start.line) {
                <div class="symbol-node" [class.selected]="selectedSymbol()?.name === sym.name && selectedSymbol()?.range?.start?.line === sym.range.start.line">
                  <button
                    class="symbol-btn"
                    type="button"
                    (click)="selectSymbol(sym)"
                  >
                    <span class="sym-kind">{{ kindIcon(sym.kind) }}</span>
                    <span class="sym-name">{{ sym.name }}</span>
                    <span class="sym-line">:{{ sym.range.start.line + 1 }}</span>
                  </button>
                  @if (sym.children && sym.children.length > 0) {
                    <div class="symbol-children">
                      @for (child of sym.children; track child.name + child.range.start.line) {
                        <button
                          class="symbol-btn child"
                          type="button"
                          (click)="selectSymbol(child)"
                          [class.selected]="selectedSymbol()?.name === child.name && selectedSymbol()?.range?.start?.line === child.range.start.line"
                        >
                          <span class="sym-kind">{{ kindIcon(child.kind) }}</span>
                          <span class="sym-name">{{ child.name }}</span>
                          <span class="sym-line">:{{ child.range.start.line + 1 }}</span>
                        </button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else if (symbolsLoaded()) {
            <div class="hint">No symbols found in this file.</div>
          } @else {
            <div class="hint">Enter a file path and click Load.</div>
          }
        </div>

        <!-- ---- Center: Symbol Detail / Hover ---- -->
        <div class="panel panel-center">
          <div class="panel-title">Symbol Detail</div>

          @if (selectedSymbol()) {
            <div class="symbol-detail-header">
              <span class="detail-kind-badge">{{ selectedSymbol()!.kind }}</span>
              <span class="detail-name">{{ selectedSymbol()!.name }}</span>
              <span class="detail-pos">line {{ selectedSymbol()!.range.start.line + 1 }}</span>
            </div>

            <div class="detail-actions">
              <button class="btn" type="button" [disabled]="working()" (click)="goToDefinition()">
                Go to Definition
              </button>
              <button class="btn" type="button" [disabled]="working()" (click)="findReferences()">
                Find References
              </button>
            </div>

            @if (hoverLoading()) {
              <div class="loading-text">Loading hover info…</div>
            } @else if (hoverInfo()) {
              <div class="hover-info">
                <div class="section-label">Hover Info</div>
                <pre class="code-block">{{ hoverInfo() }}</pre>
              </div>
            }

            @if (definitionLocations().length > 0) {
              <div class="locations-section">
                <div class="section-label">Definition</div>
                @for (loc of definitionLocations(); track loc.filePath + loc.line) {
                  <div class="location-item">
                    <span class="loc-file">{{ loc.filePath }}</span>
                    <span class="loc-pos">:{{ loc.line + 1 }}:{{ loc.character }}</span>
                    @if (loc.preview) {
                      <span class="loc-preview">{{ loc.preview }}</span>
                    }
                  </div>
                }
              </div>
            }

            @if (referenceLocations().length > 0) {
              <div class="locations-section">
                <div class="section-label">References ({{ referenceLocations().length }})</div>
                <div class="location-list">
                  @for (loc of referenceLocations(); track loc.filePath + loc.line + loc.character) {
                    <div class="location-item">
                      <span class="loc-file">{{ loc.filePath }}</span>
                      <span class="loc-pos">:{{ loc.line + 1 }}:{{ loc.character }}</span>
                      @if (loc.preview) {
                        <span class="loc-preview">{{ loc.preview }}</span>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          } @else {
            <div class="hint">Select a symbol from the tree to see details.</div>
          }
        </div>

        <!-- ---- Right: Workspace Search ---- -->
        <div class="panel panel-right">
          <div class="panel-title">Workspace Symbols</div>

          <div class="input-row">
            <input
              class="input"
              type="text"
              placeholder="Search symbols…"
              [value]="workspaceQuery()"
              (input)="onWorkspaceQueryInput($event)"
              (keydown.enter)="searchWorkspaceSymbols()"
            />
          </div>
          <div class="input-row">
            <input
              class="input"
              type="text"
              placeholder="Root path…"
              [value]="workspaceRootPath()"
              (input)="onWorkspaceRootPathInput($event)"
            />
            <button
              class="btn"
              type="button"
              [disabled]="working() || !workspaceQuery() || !workspaceRootPath()"
              (click)="searchWorkspaceSymbols()"
            >
              Search
            </button>
          </div>

          @if (workspaceLoading()) {
            <div class="loading-text">Searching…</div>
          } @else if (workspaceSymbols().length > 0) {
            <div class="workspace-results">
              @for (sym of workspaceSymbols(); track sym.name + sym.range.start.line) {
                <button
                  class="ws-item"
                  type="button"
                  (click)="selectSymbol(sym)"
                >
                  <span class="sym-kind">{{ kindIcon(sym.kind) }}</span>
                  <div class="ws-item-info">
                    <span class="ws-name">{{ sym.name }}</span>
                    <span class="ws-kind-label">{{ sym.kind }}</span>
                  </div>
                </button>
              }
            </div>
          } @else if (workspaceSearched()) {
            <div class="hint">No symbols found for "{{ workspaceQuery() }}".</div>
          } @else {
            <div class="hint">Enter a query and root path, then click Search.</div>
          }
        </div>

      </div>

      <!-- ===== Bottom: Diagnostics Panel ===== -->
      <div class="diagnostics-panel">
        <div class="diag-header">
          <div class="panel-title">Diagnostics</div>
          <div class="input-row diag-inputs">
            <input
              class="input"
              type="text"
              placeholder="File path…"
              [value]="diagnosticsFilePath()"
              (input)="onDiagnosticsFilePathInput($event)"
            />
            <button
              class="btn"
              type="button"
              [disabled]="working() || !diagnosticsFilePath()"
              (click)="loadDiagnostics()"
            >
              Load
            </button>
          </div>
        </div>

        @if (diagnosticsLoading()) {
          <div class="loading-text">Loading diagnostics…</div>
        } @else if (diagnostics().length > 0) {
          <div class="diag-table-wrap">
            <table class="diag-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                @for (diag of diagnostics(); track diag.line + diag.message) {
                  <tr class="diag-row" [class]="'diag-' + diag.severity">
                    <td class="diag-line">{{ diag.line + 1 }}:{{ diag.character }}</td>
                    <td class="diag-severity">
                      <span class="severity-badge" [class]="'sev-' + diag.severity">
                        {{ diag.severity }}
                      </span>
                    </td>
                    <td class="diag-message">{{ diag.message }}</td>
                    <td class="diag-source">{{ diag.source ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (diagnosticsLoaded()) {
          <div class="hint">No diagnostics found for this file.</div>
        } @else {
          <div class="hint">Enter a file path and click Load to see diagnostics.</div>
        }
      </div>

    </div>
  `,
  styles: [`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
    }

    /* ========== Page shell ========== */

    .page {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding: var(--spacing-lg);
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow: auto;
      box-sizing: border-box;
    }

    /* ========== Header ========== */

    .page-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      flex-shrink: 0;
    }

    .header-title {
      flex: 1;
      min-width: 0;
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

    .header-actions {
      display: flex;
      gap: var(--spacing-xs);
    }

    .header-btn,
    .btn {
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .danger-btn {
      border-color: color-mix(in srgb, var(--error-color) 60%, transparent);
      color: var(--error-color);
    }

    /* ========== Banners ========== */

    .error-banner,
    .info-banner {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-sm);
      font-size: 12px;
      flex-shrink: 0;
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

    /* ========== Status Bar ========== */

    .status-bar {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      flex-wrap: wrap;
      padding: var(--spacing-xs) var(--spacing-sm);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--bg-secondary);
      flex-shrink: 0;
      font-size: 12px;
    }

    .status-bar-label {
      font-weight: 600;
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .status-muted {
      color: var(--text-muted);
      font-size: 12px;
    }

    .server-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-weight: 500;
      border: 1px solid transparent;
    }

    .badge-running {
      background: color-mix(in srgb, var(--success-color) 14%, transparent);
      border-color: color-mix(in srgb, var(--success-color) 40%, transparent);
      color: var(--success-color);
    }

    .badge-stopped {
      background: color-mix(in srgb, var(--text-muted) 10%, transparent);
      border-color: var(--border-color);
      color: var(--text-muted);
    }

    .badge-error {
      background: color-mix(in srgb, var(--error-color) 14%, transparent);
      border-color: color-mix(in srgb, var(--error-color) 40%, transparent);
      color: var(--error-color);
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .badge-langs {
      color: var(--text-muted);
      font-size: 10px;
    }

    /* ========== 3-Column Grid ========== */

    .main-grid {
      display: grid;
      grid-template-columns: 280px 1fr 300px;
      gap: var(--spacing-md);
      min-height: 0;
      flex: 1;
    }

    /* ========== Panels ========== */

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-secondary);
      padding: var(--spacing-md);
      overflow: hidden;
    }

    .panel-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }

    /* ========== Input Row ========== */

    .input-row {
      display: flex;
      gap: var(--spacing-xs);
    }

    .input {
      flex: 1;
      min-width: 0;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 12px;
    }

    .input::placeholder {
      color: var(--text-muted);
    }

    /* ========== Symbol Tree (Left) ========== */

    .symbol-tree {
      overflow: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .symbol-node {
      display: flex;
      flex-direction: column;
    }

    .symbol-btn {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      width: 100%;
      text-align: left;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      padding: 3px var(--spacing-xs);
      cursor: pointer;
      color: var(--text-primary);
      font-size: 12px;
      transition: background 0.1s;
    }

    .symbol-btn:hover {
      background: var(--bg-tertiary);
    }

    .symbol-btn.selected,
    .symbol-node .selected {
      background: color-mix(in srgb, var(--primary-color) 15%, transparent);
      border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
    }

    .symbol-btn.child {
      padding-left: 20px;
    }

    .symbol-children {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .sym-kind {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 16px;
      font-size: 9px;
      font-weight: 700;
      background: color-mix(in srgb, var(--primary-color) 20%, transparent);
      color: var(--primary-color);
      border-radius: 3px;
      flex-shrink: 0;
      font-family: var(--font-family-mono, monospace);
    }

    .sym-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sym-line {
      font-size: 10px;
      color: var(--text-muted);
      flex-shrink: 0;
      font-family: var(--font-family-mono, monospace);
    }

    /* ========== Symbol Detail (Center) ========== */

    .panel-center {
      overflow: auto;
    }

    .symbol-detail-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .detail-kind-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--primary-color) 20%, transparent);
      color: var(--primary-color);
    }

    .detail-name {
      font-size: 14px;
      font-weight: 600;
      font-family: var(--font-family-mono, monospace);
    }

    .detail-pos {
      font-size: 11px;
      color: var(--text-muted);
      margin-left: auto;
    }

    .detail-actions {
      display: flex;
      gap: var(--spacing-xs);
      flex-shrink: 0;
    }

    .hover-info {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .section-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .code-block {
      margin: 0;
      padding: var(--spacing-sm);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--bg-primary);
      font-size: 11px;
      font-family: var(--font-family-mono, monospace);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 120px;
      overflow: auto;
    }

    .locations-section {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .location-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 180px;
      overflow: auto;
    }

    .location-item {
      display: flex;
      align-items: baseline;
      gap: 4px;
      padding: 3px var(--spacing-xs);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      font-size: 11px;
      cursor: pointer;
      flex-wrap: wrap;
    }

    .location-item:hover {
      border-color: var(--primary-color);
    }

    .loc-file {
      font-family: var(--font-family-mono, monospace);
      color: var(--primary-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 260px;
    }

    .loc-pos {
      font-family: var(--font-family-mono, monospace);
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .loc-preview {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ========== Workspace Search (Right) ========== */

    .panel-right {
      overflow: hidden;
    }

    .workspace-results {
      overflow: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ws-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      width: 100%;
      text-align: left;
      padding: 4px var(--spacing-xs);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 12px;
    }

    .ws-item:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-color);
    }

    .ws-item-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .ws-name {
      font-family: var(--font-family-mono, monospace);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ws-kind-label {
      font-size: 10px;
      color: var(--text-muted);
    }

    /* ========== Diagnostics Panel ========== */

    .diagnostics-panel {
      flex-shrink: 0;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-secondary);
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .diag-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .diag-inputs {
      flex: 1;
    }

    .diag-table-wrap {
      overflow: auto;
      max-height: 220px;
    }

    .diag-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .diag-table th {
      text-align: left;
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      background: var(--bg-secondary);
    }

    .diag-row td {
      padding: var(--spacing-xs) var(--spacing-sm);
      border-bottom: 1px solid var(--border-color);
      vertical-align: top;
    }

    .diag-line {
      font-family: var(--font-family-mono, monospace);
      color: var(--text-muted);
      white-space: nowrap;
    }

    .diag-severity {
      white-space: nowrap;
    }

    .severity-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: var(--radius-sm);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .sev-error {
      background: color-mix(in srgb, var(--error-color) 18%, transparent);
      color: var(--error-color);
    }

    .sev-warning {
      background: color-mix(in srgb, #f0ad4e 18%, transparent);
      color: #f0ad4e;
    }

    .sev-info {
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
      color: var(--primary-color);
    }

    .sev-hint {
      background: color-mix(in srgb, var(--text-muted) 15%, transparent);
      color: var(--text-muted);
    }

    .diag-message {
      color: var(--text-primary);
    }

    .diag-source {
      color: var(--text-muted);
      font-size: 11px;
      white-space: nowrap;
    }

    /* ========== Shared utilities ========== */

    .loading-text {
      font-size: 12px;
      color: var(--text-muted);
      padding: var(--spacing-xs) 0;
    }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ========== Responsive ========== */

    @media (max-width: 1200px) {
      .main-grid {
        grid-template-columns: 240px 1fr 260px;
      }
    }

    @media (max-width: 900px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class LspPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly lspIpc = inject(LspIpcService);

  // ---- Server status ----
  readonly servers = signal<LspServer[]>([]);

  // ---- Document symbols (left panel) ----
  readonly symbolFilePath = signal('');
  readonly documentSymbols = signal<DocumentSymbol[]>([]);
  readonly symbolsLoading = signal(false);
  readonly symbolsLoaded = signal(false);
  readonly selectedSymbol = signal<DocumentSymbol | null>(null);

  // ---- Hover / detail (center panel) ----
  readonly hoverInfo = signal<string | null>(null);
  readonly hoverLoading = signal(false);
  readonly definitionLocations = signal<LocationItem[]>([]);
  readonly referenceLocations = signal<LocationItem[]>([]);

  // ---- Workspace symbols (right panel) ----
  readonly workspaceQuery = signal('');
  readonly workspaceRootPath = signal('');
  readonly workspaceSymbols = signal<DocumentSymbol[]>([]);
  readonly workspaceLoading = signal(false);
  readonly workspaceSearched = signal(false);

  // ---- Diagnostics (bottom panel) ----
  readonly diagnosticsFilePath = signal('');
  readonly diagnostics = signal<DiagnosticItem[]>([]);
  readonly diagnosticsLoading = signal(false);
  readonly diagnosticsLoaded = signal(false);

  // ---- Global state ----
  readonly working = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);

  // ---- Derived ----
  readonly hasSelectedSymbol = computed(() => this.selectedSymbol() !== null);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  kindIcon(kind: string): string {
    return symbolKindIcon(kind);
  }

  // ============================================================
  // Refresh (header button)
  // ============================================================

  async refresh(): Promise<void> {
    this.working.set(true);
    this.clearMessages();

    try {
      await Promise.all([this.loadServers(), this.loadStatus()]);
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.working.set(false);
    }
  }

  // ============================================================
  // Server status
  // ============================================================

  private async loadServers(): Promise<void> {
    const response = await this.lspIpc.lspGetAvailableServers();
    if (!response.success) return;

    const raw = response.data as unknown[];
    if (!Array.isArray(raw)) return;

    const servers = raw
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item): LspServer => ({
        id: String(item['id'] ?? item['name'] ?? 'unknown'),
        name: String(item['name'] ?? item['id'] ?? 'Unknown'),
        languages: Array.isArray(item['languages'])
          ? (item['languages'] as unknown[]).map(String)
          : [],
        status: this.coerceServerStatus(item['status']),
      }));

    this.servers.set(servers);
  }

  private async loadStatus(): Promise<void> {
    const response = await this.lspIpc.lspGetStatus();
    if (!response.success) return;

    // Merge running-client status into server list when available
    const statusMap = response.data as Record<string, unknown> | null;
    if (!statusMap || typeof statusMap !== 'object') return;

    this.servers.update((current) =>
      current.map((srv) => {
        const clientStatus = statusMap[srv.id];
        if (clientStatus === 'running') return { ...srv, status: 'running' as const };
        if (clientStatus === 'stopped') return { ...srv, status: 'stopped' as const };
        if (clientStatus === 'error') return { ...srv, status: 'error' as const };
        return srv;
      })
    );
  }

  private coerceServerStatus(raw: unknown): LspServer['status'] {
    if (raw === 'running') return 'running';
    if (raw === 'stopped') return 'stopped';
    if (raw === 'error') return 'error';
    return 'stopped';
  }

  // ============================================================
  // Document symbols
  // ============================================================

  async loadDocumentSymbols(): Promise<void> {
    const filePath = this.symbolFilePath();
    if (!filePath) return;

    this.symbolsLoading.set(true);
    this.symbolsLoaded.set(false);
    this.documentSymbols.set([]);
    this.selectedSymbol.set(null);
    this.hoverInfo.set(null);
    this.definitionLocations.set([]);
    this.referenceLocations.set([]);
    this.clearMessages();

    try {
      const response = await this.lspIpc.lspDocumentSymbols(filePath);
      this.assertSuccess(response, 'Failed to load document symbols.');
      const symbols = this.parseSymbols(response.data);
      this.documentSymbols.set(symbols);
      this.symbolsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.symbolsLoading.set(false);
    }
  }

  // ============================================================
  // Symbol selection & hover
  // ============================================================

  selectSymbol(sym: DocumentSymbol): void {
    this.selectedSymbol.set(sym);
    this.hoverInfo.set(null);
    this.definitionLocations.set([]);
    this.referenceLocations.set([]);
    void this.loadHover(sym);
  }

  private async loadHover(sym: DocumentSymbol): Promise<void> {
    const filePath = this.symbolFilePath();
    if (!filePath) return;

    this.hoverLoading.set(true);

    try {
      const response = await this.lspIpc.lspHover(
        filePath,
        sym.range.start.line,
        sym.range.start.character,
      );
      if (response.success && response.data) {
        const content = this.extractHoverContent(response.data);
        this.hoverInfo.set(content);
      }
    } catch {
      // Non-critical — hover is best-effort
    } finally {
      this.hoverLoading.set(false);
    }
  }

  // ============================================================
  // Go to definition
  // ============================================================

  async goToDefinition(): Promise<void> {
    const sym = this.selectedSymbol();
    const filePath = this.symbolFilePath();
    if (!sym || !filePath) return;

    this.working.set(true);
    this.definitionLocations.set([]);
    this.clearMessages();

    try {
      const response = await this.lspIpc.lspGoToDefinition(
        filePath,
        sym.range.start.line,
        sym.range.start.character,
      );
      this.assertSuccess(response, 'Failed to find definition.');
      const locations = this.parseLocations(response.data);
      this.definitionLocations.set(locations);
      if (locations.length === 0) {
        this.infoMessage.set('No definition found.');
      }
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.working.set(false);
    }
  }

  // ============================================================
  // Find references
  // ============================================================

  async findReferences(): Promise<void> {
    const sym = this.selectedSymbol();
    const filePath = this.symbolFilePath();
    if (!sym || !filePath) return;

    this.working.set(true);
    this.referenceLocations.set([]);
    this.clearMessages();

    try {
      const response = await this.lspIpc.lspFindReferences(
        filePath,
        sym.range.start.line,
        sym.range.start.character,
        true,
      );
      this.assertSuccess(response, 'Failed to find references.');
      const locations = this.parseLocations(response.data);
      this.referenceLocations.set(locations);
      if (locations.length === 0) {
        this.infoMessage.set('No references found.');
      }
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.working.set(false);
    }
  }

  // ============================================================
  // Workspace symbol search
  // ============================================================

  async searchWorkspaceSymbols(): Promise<void> {
    const query = this.workspaceQuery();
    const rootPath = this.workspaceRootPath();
    if (!query || !rootPath) return;

    this.workspaceLoading.set(true);
    this.workspaceSearched.set(false);
    this.workspaceSymbols.set([]);
    this.clearMessages();

    try {
      const response = await this.lspIpc.lspWorkspaceSymbols(query, rootPath);
      this.assertSuccess(response, 'Failed to search workspace symbols.');
      const symbols = this.parseSymbols(response.data);
      this.workspaceSymbols.set(symbols);
      this.workspaceSearched.set(true);
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.workspaceLoading.set(false);
    }
  }

  // ============================================================
  // Diagnostics
  // ============================================================

  async loadDiagnostics(): Promise<void> {
    const filePath = this.diagnosticsFilePath();
    if (!filePath) return;

    this.diagnosticsLoading.set(true);
    this.diagnosticsLoaded.set(false);
    this.diagnostics.set([]);
    this.clearMessages();

    try {
      const response = await this.lspIpc.lspDiagnostics(filePath);
      this.assertSuccess(response, 'Failed to load diagnostics.');
      const items = this.parseDiagnostics(response.data);
      this.diagnostics.set(items);
      this.diagnosticsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.diagnosticsLoading.set(false);
    }
  }

  // ============================================================
  // Shutdown
  // ============================================================

  async shutdown(): Promise<void> {
    this.working.set(true);
    this.clearMessages();

    try {
      const response = await this.lspIpc.lspShutdown();
      this.assertSuccess(response, 'Failed to shut down LSP servers.');
      this.servers.update((current) =>
        current.map((srv) => ({ ...srv, status: 'stopped' as const }))
      );
      this.infoMessage.set('All LSP servers shut down.');
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.working.set(false);
    }
  }

  // ============================================================
  // Input handlers
  // ============================================================

  onSymbolFilePathInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.symbolFilePath.set(target.value);
  }

  onDiagnosticsFilePathInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.diagnosticsFilePath.set(target.value);
  }

  onWorkspaceQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.workspaceQuery.set(target.value);
  }

  onWorkspaceRootPathInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.workspaceRootPath.set(target.value);
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private parseSymbols(data: unknown): DocumentSymbol[] {
    if (!Array.isArray(data)) return [];

    return data
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item): DocumentSymbol => ({
        name: String(item['name'] ?? 'unknown'),
        kind: String(item['kind'] ?? 'Unknown'),
        range: this.parseRange(item['range']),
        children: Array.isArray(item['children'])
          ? this.parseSymbols(item['children'])
          : undefined,
      }));
  }

  private parseRange(raw: unknown): DocumentSymbol['range'] {
    const fallback = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    if (!raw || typeof raw !== 'object') return fallback;

    const r = raw as Record<string, unknown>;
    const start = r['start'] as Record<string, unknown> | undefined;
    const end = r['end'] as Record<string, unknown> | undefined;

    return {
      start: {
        line: Number(start?.['line'] ?? 0),
        character: Number(start?.['character'] ?? 0),
      },
      end: {
        line: Number(end?.['line'] ?? 0),
        character: Number(end?.['character'] ?? 0),
      },
    };
  }

  private parseLocations(data: unknown): LocationItem[] {
    const raw = Array.isArray(data) ? data : (data ? [data] : []);

    return raw
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item): LocationItem => {
        // Support both { filePath, line, character } and LSP Location { uri, range }
        const filePath = String(item['filePath'] ?? item['uri'] ?? '');
        const range = item['range'] as Record<string, unknown> | undefined;
        const start = range?.['start'] as Record<string, unknown> | undefined;
        const line = Number(item['line'] ?? start?.['line'] ?? 0);
        const character = Number(item['character'] ?? start?.['character'] ?? 0);
        const preview = typeof item['preview'] === 'string' ? item['preview'] : undefined;

        return { filePath, line, character, preview };
      });
  }

  private parseDiagnostics(data: unknown): DiagnosticItem[] {
    if (!Array.isArray(data)) return [];

    return data
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item): DiagnosticItem => {
        const range = item['range'] as Record<string, unknown> | undefined;
        const start = range?.['start'] as Record<string, unknown> | undefined;
        const line = Number(item['line'] ?? start?.['line'] ?? 0);
        const character = Number(item['character'] ?? start?.['character'] ?? 0);
        const severity = this.coerceSeverity(item['severity']);
        const message = String(item['message'] ?? '');
        const source = typeof item['source'] === 'string' ? item['source'] : undefined;

        return { line, character, severity, message, source };
      });
  }

  private coerceSeverity(raw: unknown): DiagnosticItem['severity'] {
    // LSP uses numeric severity: 1=error, 2=warning, 3=info, 4=hint
    if (raw === 1 || raw === 'error') return 'error';
    if (raw === 2 || raw === 'warning') return 'warning';
    if (raw === 3 || raw === 'info') return 'info';
    if (raw === 4 || raw === 'hint') return 'hint';
    return 'info';
  }

  private extractHoverContent(data: unknown): string {
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      // LSP hover result has { contents: MarkupContent | MarkedString | ... }
      const contents = d['contents'];
      if (typeof contents === 'string') return contents;
      if (contents && typeof contents === 'object') {
        const c = contents as Record<string, unknown>;
        if (typeof c['value'] === 'string') return c['value'];
      }
    }
    return JSON.stringify(data, null, 2);
  }

  private assertSuccess(response: IpcResponse, fallback: string): void {
    if (!response.success) {
      throw new Error(response.error?.message ?? fallback);
    }
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.infoMessage.set(null);
  }
}
