/**
 * Agent Card Component
 *
 * Displays an individual CLI agent with:
 * - Status indicator (available/unavailable)
 * - Version information
 * - Capability badges
 * - Selection state
 * - Configure/Install actions
 */

import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import type { CliInfo } from '../../../../shared/types/unified-cli-response';

@Component({
  selector: 'app-agent-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="agent-card"
      [class.selected]="selected()"
      [class.unavailable]="unavailable()"
      (click)="handleClick()"
    >
      <!-- Status Header -->
      <div class="card-header">
        <div class="status-row">
          <div
            class="status-dot"
            [class.available]="cli().installed && !unavailable()"
            [class.auth-required]="cli().installed && cli().authenticated === false"
            [class.not-found]="!cli().installed || unavailable()"
          ></div>
          <h3 class="agent-name">{{ cli().displayName || cli().name }}</h3>
        </div>
        @if (selected()) {
          <span class="selected-badge">Selected</span>
        }
      </div>

      <!-- Version & Status -->
      <div class="card-status">
        @if (cli().installed && !unavailable()) {
          <span class="version">CLI v{{ cli().version || 'unknown' }}</span>
        } @else if (cli().installed && cli().authenticated === false) {
          <span class="auth-warning">Authentication Required</span>
        } @else {
          <span class="not-found">Not Found</span>
        }
      </div>

      <!-- Capabilities -->
      @if (cli().installed && !unavailable()) {
        <div class="capabilities">
          @if (hasCapability('streaming')) {
            <span class="capability-badge">Streaming</span>
          }
          @if (hasCapability('tools')) {
            <span class="capability-badge">Tools</span>
          }
          @if (hasCapability('vision')) {
            <span class="capability-badge">Vision</span>
          }
          @if (hasCapability('local')) {
            <span class="capability-badge">Local</span>
          }
        </div>
      }

      <!-- Actions -->
      <div class="card-actions">
        @if (cli().installed && !unavailable()) {
          <button
            class="action-link"
            (click)="handleConfigure($event)"
          >
            Configure
          </button>
        } @else {
          <button
            class="action-link"
            (click)="handleInstall($event)"
          >
            Install Guide
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .agent-card {
      background: var(--bg-primary);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .agent-card:hover:not(.unavailable) {
      border-color: var(--border-hover, #9ca3af);
    }

    .agent-card.selected {
      border-color: var(--accent-color, #3b82f6);
      background: rgba(59, 130, 246, 0.05);
    }

    .agent-card.unavailable {
      opacity: 0.7;
      cursor: default;
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .status-dot.available {
      background: #22c55e;
    }

    .status-dot.auth-required {
      background: #f59e0b;
    }

    .status-dot.not-found {
      background: #ef4444;
    }

    .agent-name {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
    }

    .selected-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      background: var(--accent-color, #3b82f6);
      color: white;
      border-radius: 4px;
    }

    .card-status {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .version {
      color: var(--text-secondary);
    }

    .auth-warning {
      color: #f59e0b;
    }

    .not-found {
      color: #ef4444;
    }

    .capabilities {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .capability-badge {
      font-size: 11px;
      padding: 3px 8px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border-radius: 4px;
    }

    .capability-badge::before {
      content: '✓ ';
    }

    .card-actions {
      display: flex;
      gap: 12px;
    }

    .action-link {
      background: none;
      border: none;
      font-size: 13px;
      color: var(--accent-color, #3b82f6);
      cursor: pointer;
      padding: 0;
    }

    .action-link:hover {
      text-decoration: underline;
    }
  `],
})
export class AgentCardComponent {
  // Inputs
  cli = input.required<CliInfo>();
  selected = input<boolean>(false);
  unavailable = input<boolean>(false);

  // Outputs
  select = output<void>();
  configure = output<void>();
  install = output<void>();

  // ============================================
  // Helpers
  // ============================================

  hasCapability(cap: string): boolean {
    const capabilities = this.cli().capabilities || [];
    return capabilities.includes(cap);
  }

  // ============================================
  // Event Handlers
  // ============================================

  handleClick(): void {
    if (!this.unavailable() && this.cli().installed) {
      this.select.emit();
    }
  }

  handleConfigure(event: Event): void {
    event.stopPropagation();
    this.configure.emit();
  }

  handleInstall(event: Event): void {
    event.stopPropagation();
    this.install.emit();
  }
}
