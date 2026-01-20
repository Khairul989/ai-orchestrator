/**
 * CLI Status Indicator Component
 *
 * Displays CLI status as a dot badge:
 * - Color-coded status (green/orange/red)
 * - Optional label text
 * - Pulsing animation for active states
 */

import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { CliStatus } from '../../../../shared/types/verification-ui.types';

const STATUS_CONFIG: Record<CliStatus, { color: string; label: string; pulse: boolean }> = {
  'available': { color: '#22c55e', label: 'Available', pulse: false },
  'auth-required': { color: '#f59e0b', label: 'Auth Required', pulse: true },
  'not-found': { color: '#ef4444', label: 'Not Found', pulse: false },
  'error': { color: '#ef4444', label: 'Error', pulse: false },
  'checking': { color: '#3b82f6', label: 'Checking...', pulse: true },
};

@Component({
  selector: 'app-cli-status-indicator',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="status-indicator" [class.compact]="compact()">
      <div
        class="status-dot"
        [class.pulse]="config().pulse"
        [style.background]="config().color"
        [style.box-shadow]="'0 0 6px ' + config().color"
        [title]="config().label"
      ></div>
      @if (showLabel()) {
        <span
          class="status-label"
          [style.color]="config().color"
        >
          {{ customLabel() || config().label }}
        </span>
      }
    </div>
  `,
  styles: [`
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .status-indicator.compact {
      gap: 4px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .compact .status-dot {
      width: 8px;
      height: 8px;
    }

    .status-dot.pulse {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.1);
      }
    }

    .status-label {
      font-size: 12px;
      font-weight: 500;
    }

    .compact .status-label {
      font-size: 11px;
    }
  `],
})
export class CliStatusIndicatorComponent {
  // Inputs
  status = input.required<CliStatus>();
  showLabel = input<boolean>(true);
  customLabel = input<string | undefined>(undefined);
  compact = input<boolean>(false);

  // Computed
  config = computed(() => {
    return STATUS_CONFIG[this.status()] || STATUS_CONFIG['error'];
  });
}
