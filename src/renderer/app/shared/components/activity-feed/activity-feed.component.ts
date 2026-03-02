import {
  Component, input, output, signal, computed, ChangeDetectionStrategy,
  ElementRef, viewChild, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FeedEvent {
  id: string;
  timestamp: number;
  type: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  title: string;
  detail?: string;
  icon?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  debug: '#9a9aa0', info: '#c4c4c9', warn: '#eab308', error: '#ef4444'
};

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="feed-wrapper">
      @if (filterTypes().length > 0) {
        <div class="feed-filters">
          @for (type of uniqueTypes(); track type) {
            <button class="filter-chip"
              [class.active]="!hiddenTypes().has(type)"
              (click)="toggleType(type)">
              {{ type }}
            </button>
          }
        </div>
      }

      <div #feedContainer class="feed-container" [class.auto-scroll]="autoScroll()">
        @if (filteredEvents().length === 0) {
          <div class="feed-empty">No events yet</div>
        } @else {
          @for (event of visibleEvents(); track event.id) {
            <div class="feed-item" [class.expanded]="expandedId() === event.id"
              tabindex="0"
              role="button"
              (click)="onEventClick(event)"
              (keydown.enter)="onEventClick(event)"
              (keydown.space)="onEventClick(event)">
              <div class="item-header">
                <span class="severity-dot" [style.background]="getSeverityColor(event.severity)"></span>
                <span class="item-type">{{ event.type }}</span>
                <span class="item-title">{{ event.title }}</span>
                <span class="item-time">{{ formatTime(event.timestamp) }}</span>
              </div>
              @if (event.detail && expandedId() === event.id) {
                <div class="item-detail">{{ event.detail }}</div>
              }
            </div>
          }
          @if (hasMore()) {
            <button class="load-more" (click)="loadMore()">
              Show {{ remainingCount() }} more...
            </button>
          }
        }
      </div>

      @if (autoScroll()) {
        <button class="scroll-toggle" (click)="autoScroll.set(!autoScroll())">
          {{ autoScroll() ? '\u23f8 Pause' : '\u25b6 Resume' }} auto-scroll
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .feed-wrapper {
      display: flex; flex-direction: column; height: 100%;
      background: var(--bg-secondary, #0c0c0f); border-radius: var(--radius-md, 8px);
      border: 1px solid var(--border-color, #2a2a2e); overflow: hidden;
    }
    .feed-filters {
      display: flex; gap: 4px; padding: var(--spacing-sm, 8px); flex-wrap: wrap;
      border-bottom: 1px solid var(--border-color, #2a2a2e);
    }
    .filter-chip {
      padding: 2px 8px; border-radius: 999px; font-size: 0.6875rem;
      background: var(--bg-tertiary, #111114); border: 1px solid var(--border-color, #2a2a2e);
      color: var(--text-muted, #9a9aa0); cursor: pointer;
      &.active { border-color: var(--primary-color, #f59e0b); color: var(--primary-color, #f59e0b); }
    }
    .feed-container {
      flex: 1; overflow-y: auto; padding: var(--spacing-xs, 4px);
      &.auto-scroll { scroll-behavior: smooth; }
    }
    .feed-item {
      padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
      border-bottom: 1px solid var(--border-subtle, #1a1a1e); cursor: pointer;
      transition: background var(--transition-fast, 0.1s);
      &:hover { background: rgba(245, 158, 11, 0.03); }
      &.expanded { background: rgba(245, 158, 11, 0.05); }
    }
    .item-header {
      display: flex; align-items: center; gap: var(--spacing-sm, 8px); font-size: 0.8125rem;
    }
    .severity-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .item-type {
      color: var(--text-muted, #9a9aa0); font-size: 0.6875rem; text-transform: uppercase;
      font-weight: 600; letter-spacing: 0.05em; min-width: 60px;
    }
    .item-title { color: var(--text-primary, #fafaf9); flex: 1; }
    .item-time { color: var(--text-muted, #9a9aa0); font-size: 0.6875rem; font-family: 'JetBrains Mono', monospace; }
    .item-detail {
      margin-top: var(--spacing-xs, 4px); padding-left: 22px;
      color: var(--text-secondary, #c4c4c9); font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace; white-space: pre-wrap;
    }
    .feed-empty {
      padding: var(--spacing-2xl, 32px); text-align: center;
      color: var(--text-muted, #9a9aa0); font-size: 0.8125rem;
    }
    .load-more {
      width: 100%; padding: var(--spacing-sm, 8px); background: none;
      border: none; color: var(--primary-color, #f59e0b); cursor: pointer;
      font-size: 0.75rem;
      &:hover { text-decoration: underline; }
    }
    .scroll-toggle {
      padding: 4px 12px; margin: 4px; align-self: flex-end;
      background: var(--bg-tertiary, #111114); border: 1px solid var(--border-color, #2a2a2e);
      border-radius: var(--radius-sm, 4px); color: var(--text-muted, #9a9aa0);
      font-size: 0.6875rem; cursor: pointer;
    }
  `]
})
export class ActivityFeedComponent {
  readonly events = input<FeedEvent[]>([]);
  readonly maxVisible = input(50);
  readonly filterTypes = input<string[]>([]);
  readonly autoScroll = signal(true);
  readonly eventClick = output<FeedEvent>();

  private feedContainer = viewChild<ElementRef<HTMLDivElement>>('feedContainer');
  readonly expandedId = signal<string | null>(null);
  readonly hiddenTypes = signal(new Set<string>());
  readonly visibleCount = signal(50);

  readonly uniqueTypes = computed(() => [...new Set(this.events().map(e => e.type))].sort());

  readonly filteredEvents = computed(() => {
    const hidden = this.hiddenTypes();
    return this.events()
      .filter(e => !hidden.has(e.type))
      .sort((a, b) => b.timestamp - a.timestamp);
  });

  readonly visibleEvents = computed(() =>
    this.filteredEvents().slice(0, this.visibleCount())
  );
  readonly hasMore = computed(() => this.filteredEvents().length > this.visibleCount());
  readonly remainingCount = computed(() => this.filteredEvents().length - this.visibleCount());

  constructor() {
    effect(() => {
      if (this.autoScroll() && this.events().length > 0) {
        const el = this.feedContainer()?.nativeElement;
        if (el) el.scrollTop = 0;
      }
    });
  }

  toggleType(type: string): void {
    this.hiddenTypes.update(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  onEventClick(event: FeedEvent): void {
    this.expandedId.set(this.expandedId() === event.id ? null : event.id);
    this.eventClick.emit(event);
  }

  loadMore(): void { this.visibleCount.update(c => c + 50); }

  getSeverityColor(severity: string): string { return SEVERITY_COLORS[severity] ?? '#9a9aa0'; }

  formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }
}
