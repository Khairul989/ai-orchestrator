/**
 * CLI Detection Panel Component
 *
 * Panel for scanning and displaying available CLIs:
 * - Scan button with progress
 * - CLI cards with status
 * - Install/configure links
 */

import {
  Component,
  input,
  output,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CliDetectionService } from './services/cli-detection.service';
import { CliStatusIndicatorComponent } from './cli-status-indicator.component';
import { AgentCapabilityBadgesComponent } from './agent-capability-badges.component';
import type { CliStatusInfo, CliStatus } from '../../../../shared/types/verification-ui.types';
import type { CliType } from '../../../../shared/types/unified-cli-response';

@Component({
  selector: 'app-cli-detection-panel',
  standalone: true,
  imports: [CommonModule, CliStatusIndicatorComponent, AgentCapabilityBadgesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detection-panel">
      <!-- Header -->
      <div class="panel-header">
        <h3 class="panel-title">CLI Agents</h3>
        <div class="header-actions">
          @if (service.lastScanTime()) {
            <span class="last-scan">
              Last scan: {{ formatTime(service.lastScanTime()!) }}
            </span>
          }
          <button
            class="scan-btn"
            [disabled]="service.isScanning()"
            (click)="handleScan()"
          >
            @if (service.isScanning()) {
              <span class="spinner"></span>
              Scanning...
            } @else {
              🔍 Scan
            }
          </button>
        </div>
      </div>

      <!-- Error Alert -->
      @if (service.scanError()) {
        <div class="error-alert">
          <span class="error-icon">⚠️</span>
          <span class="error-text">{{ service.scanError() }}</span>
          <button class="dismiss-btn" (click)="dismissError()">×</button>
        </div>
      }

      <!-- CLI Grid -->
      <div class="cli-grid">
        @for (cli of service.cliList(); track cli.type) {
          <div
            class="cli-card"
            [class.available]="cli.status === 'available'"
            [class.selected]="isSelected(cli.type)"
            (click)="handleCliClick(cli)"
          >
            <div class="card-header">
              <app-cli-status-indicator
                [status]="cli.status"
                [showLabel]="false"
              />
              <span class="cli-name">{{ getDisplayName(cli.type) }}</span>
              @if (isSelected(cli.type)) {
                <span class="selected-badge">✓</span>
              }
            </div>

            <div class="card-body">
              @if (cli.version) {
                <span class="cli-version">v{{ cli.version }}</span>
              }

              @if (cli.capabilities && cli.capabilities.length > 0) {
                <app-agent-capability-badges
                  [capabilities]="cli.capabilities"
                  [maxVisible]="3"
                  [compact]="true"
                />
              }
            </div>

            <div class="card-footer">
              @switch (cli.status) {
                @case ('available') {
                  <button
                    class="action-link"
                    (click)="handleConfigure(cli.type, $event)"
                  >
                    Configure
                  </button>
                }
                @case ('auth-required') {
                  <button
                    class="action-link warning"
                    (click)="handleAuth(cli.type, $event)"
                  >
                    Authenticate
                  </button>
                }
                @case ('not-found') {
                  <button
                    class="action-link"
                    (click)="handleInstall(cli.type, $event)"
                  >
                    Install
                  </button>
                }
                @case ('error') {
                  <span class="error-text">{{ cli.errorMessage || 'Error' }}</span>
                }
              }
            </div>
          </div>
        }
      </div>

      <!-- Summary -->
      <div class="panel-summary">
        <span class="summary-stat available">
          {{ service.availableClis().length }} available
        </span>
        <span class="summary-divider">•</span>
        <span class="summary-stat">
          {{ selectedClis().length }} selected
        </span>
        @if (service.authRequiredClis().length > 0) {
          <span class="summary-divider">•</span>
          <span class="summary-stat warning">
            {{ service.authRequiredClis().length }} need auth
          </span>
        }
      </div>
    </div>
  `,
  styles: [`
    .detection-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      border-radius: 8px;
      border: 1px solid var(--border-color, #374151);
    }

    /* Header */
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .panel-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .last-scan {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }

    .scan-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--accent-color, #3b82f6);
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: white;
      cursor: pointer;
      transition: background 0.2s;
    }

    .scan-btn:hover:not(:disabled) {
      background: #2563eb;
    }

    .scan-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spinner {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Error Alert */
    .error-alert {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 6px;
    }

    .error-icon {
      font-size: 14px;
    }

    .error-text {
      flex: 1;
      font-size: 12px;
      color: #ef4444;
    }

    .dismiss-btn {
      background: none;
      border: none;
      color: #ef4444;
      cursor: pointer;
      padding: 0;
      font-size: 16px;
      line-height: 1;
    }

    /* CLI Grid */
    .cli-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .cli-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--bg-tertiary, #262626);
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .cli-card:hover {
      border-color: var(--border-hover, #9ca3af);
    }

    .cli-card.available {
      cursor: pointer;
    }

    .cli-card.selected {
      border-color: var(--accent-color, #3b82f6);
      background: rgba(59, 130, 246, 0.05);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cli-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .selected-badge {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-color, #3b82f6);
      color: white;
      border-radius: 50%;
      font-size: 10px;
      font-weight: bold;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cli-version {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }

    .card-footer {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .action-link {
      background: none;
      border: none;
      padding: 0;
      font-size: 12px;
      color: var(--accent-color, #3b82f6);
      cursor: pointer;
    }

    .action-link:hover {
      text-decoration: underline;
    }

    .action-link.warning {
      color: #f59e0b;
    }

    /* Summary */
    .panel-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color, #374151);
      font-size: 12px;
    }

    .summary-stat {
      color: var(--text-secondary);
    }

    .summary-stat.available {
      color: #22c55e;
    }

    .summary-stat.warning {
      color: #f59e0b;
    }

    .summary-divider {
      color: var(--text-muted, #6b7280);
    }
  `],
})
export class CliDetectionPanelComponent {
  service = inject(CliDetectionService);

  // Inputs
  selectedClis = input<CliType[]>([]);

  // Outputs
  cliSelect = output<CliType>();
  cliDeselect = output<CliType>();
  cliConfigure = output<CliType>();
  cliInstall = output<CliType>();
  cliAuth = output<CliType>();
  scanComplete = output<void>();

  // ============================================
  // Methods
  // ============================================

  isSelected(type: CliType): boolean {
    return this.selectedClis().includes(type);
  }

  getDisplayName(type: CliType): string {
    const metadata = this.service.getCliMetadata(type);
    return metadata?.displayName || type;
  }

  async handleScan(): Promise<void> {
    await this.service.scanAll(true);
    this.scanComplete.emit();
  }

  handleCliClick(cli: CliStatusInfo): void {
    if (cli.status !== 'available') return;

    if (this.isSelected(cli.type)) {
      this.cliDeselect.emit(cli.type);
    } else {
      this.cliSelect.emit(cli.type);
    }
  }

  handleConfigure(type: CliType, event: Event): void {
    event.stopPropagation();
    this.cliConfigure.emit(type);
  }

  handleInstall(type: CliType, event: Event): void {
    event.stopPropagation();
    const url = this.service.getInstallUrl(type);
    if (url) {
      window.open(url, '_blank');
    }
    this.cliInstall.emit(type);
  }

  handleAuth(type: CliType, event: Event): void {
    event.stopPropagation();
    this.cliAuth.emit(type);
  }

  dismissError(): void {
    // Error will clear on next scan
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
