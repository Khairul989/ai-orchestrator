import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="metric-card" [class.loading]="loading()" [class.compact]="compact()">
      @if (loading()) {
        <div class="skeleton-value"></div>
        <div class="skeleton-label"></div>
      } @else {
        <div class="card-header">
          @if (icon()) {
            <span class="card-icon" [innerHTML]="icon()"></span>
          }
          <span class="card-label">{{ label() }}</span>
        </div>
        <div class="card-value">{{ formattedValue() }}</div>
        @if (trend()) {
          <div class="card-trend" [class]="'trend-' + trend()">
            <span class="trend-arrow">{{ trendArrow() }}</span>
            @if (trendValue()) {
              <span class="trend-value">{{ trendValue() }}</span>
            }
          </div>
        }
        @if (subtitle()) {
          <div class="card-subtitle">{{ subtitle() }}</div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .metric-card {
      padding: var(--spacing-lg, 24px); border-radius: var(--radius-md, 8px);
      background: var(--bg-elevated, #18181b); border: 1px solid var(--border-color, #2a2a2e);
      transition: border-color var(--transition-normal, 0.2s), transform var(--transition-normal, 0.2s);
      &:hover { border-color: var(--border-hover, #3a3a3e); transform: translateY(-1px); }
      &.compact { padding: var(--spacing-md, 16px); }
    }
    .card-header {
      display: flex; align-items: center; gap: var(--spacing-xs, 4px); margin-bottom: var(--spacing-xs, 4px);
    }
    .card-icon { font-size: 1rem; opacity: 0.7; }
    .card-label {
      font-size: 0.6875rem; color: var(--text-muted, #9a9aa0);
      text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
    }
    .card-value {
      font-size: 1.75rem; font-weight: 700; color: var(--text-primary, #fafaf9);
      font-family: 'JetBrains Mono', monospace; line-height: 1.2;
    }
    .compact .card-value { font-size: 1.25rem; }
    .card-trend {
      display: flex; align-items: center; gap: 4px; margin-top: var(--spacing-xs, 4px);
      font-size: 0.75rem; font-weight: 600;
    }
    .trend-up { color: #22c55e; }
    .trend-down { color: #ef4444; }
    .trend-flat { color: var(--text-muted, #9a9aa0); }
    .card-subtitle {
      margin-top: var(--spacing-xs, 4px); font-size: 0.6875rem;
      color: var(--text-muted, #9a9aa0);
    }
    .skeleton-value {
      width: 60%; height: 28px; background: var(--bg-tertiary, #111114);
      border-radius: 4px; animation: shimmer 1.5s infinite;
    }
    .skeleton-label {
      width: 40%; height: 12px; margin-top: 8px; background: var(--bg-tertiary, #111114);
      border-radius: 4px; animation: shimmer 1.5s infinite;
    }
    @keyframes shimmer { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } }
  `]
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly trend = input<'up' | 'down' | 'flat' | null>(null);
  readonly trendValue = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly loading = input(false);
  readonly compact = input(false);

  readonly formattedValue = computed(() => {
    const v = this.value();
    if (typeof v === 'number') {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
      return v.toLocaleString();
    }
    return v;
  });

  readonly trendArrow = computed(() => {
    switch (this.trend()) {
      case 'up': return '\u2191';
      case 'down': return '\u2193';
      case 'flat': return '\u2192';
      default: return '';
    }
  });
}
