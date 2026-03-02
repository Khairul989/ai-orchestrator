import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeStatus = 'connected' | 'disconnected' | 'warning' | 'error' | 'loading' | 'idle' | 'active';

const STATUS_CONFIG: Record<BadgeStatus, { color: string; bg: string; label: string }> = {
  connected: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Connected' },
  disconnected: { color: '#9a9aa0', bg: 'rgba(154,154,160,0.12)', label: 'Disconnected' },
  warning: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', label: 'Warning' },
  error: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Error' },
  loading: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Loading' },
  idle: { color: '#9a9aa0', bg: 'rgba(154,154,160,0.08)', label: 'Idle' },
  active: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Active' }
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge"
      [style.color]="config().color"
      [style.background]="config().bg"
      [class.pulse]="shouldPulse()">
      <span class="dot" [style.background]="config().color"></span>
      {{ displayLabel() }}
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 2px 10px 2px 8px; border-radius: 999px;
      font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.02em;
      text-transform: uppercase; white-space: nowrap;
      transition: all var(--transition-normal, 0.2s);
    }
    .dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
      transition: background var(--transition-normal, 0.2s);
    }
    .pulse .dot { animation: pulse-dot 1.5s ease-in-out infinite; }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.4); }
    }
  `]
})
export class StatusBadgeComponent {
  readonly status = input<BadgeStatus>('idle');
  readonly label = input<string | null>(null);
  readonly pulse = input<boolean | null>(null);

  readonly config = computed(() => STATUS_CONFIG[this.status()] ?? STATUS_CONFIG.idle);
  readonly displayLabel = computed(() => this.label() ?? this.config().label);
  readonly shouldPulse = computed(() => {
    const p = this.pulse();
    if (p !== null) return p;
    const s = this.status();
    return s === 'active' || s === 'loading';
  });
}
