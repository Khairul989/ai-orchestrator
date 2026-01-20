/**
 * Timeline View Component
 *
 * Displays chronological events in a timeline:
 * - Vertical timeline layout
 * - Color-coded event types
 * - Timestamp and elapsed time
 * - Expandable descriptions
 */

import {
  Component,
  input,
  output,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  TimelineEvent,
  TimelineEventType,
  TimelineConfig,
  DEFAULT_TIMELINE_COLORS,
} from '../../../../../shared/types/verification-ui.types';

const COLORS: Record<TimelineEventType, string> = {
  'start': '#3b82f6',
  'progress': '#8b5cf6',
  'complete': '#22c55e',
  'error': '#ef4444',
  'agent-start': '#06b6d4',
  'agent-complete': '#10b981',
  'round-start': '#f59e0b',
  'round-complete': '#eab308',
  'synthesis-start': '#ec4899',
  'synthesis-complete': '#d946ef',
  'consensus-reached': '#22c55e',
};

const TYPE_ICONS: Record<TimelineEventType, string> = {
  'start': '▶',
  'progress': '⏳',
  'complete': '✓',
  'error': '✕',
  'agent-start': '🤖',
  'agent-complete': '✓',
  'round-start': '🔄',
  'round-complete': '✓',
  'synthesis-start': '🔀',
  'synthesis-complete': '✓',
  'consensus-reached': '🤝',
};

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="timeline-view" [class.compact]="compact()">
      @if (sortedEvents().length === 0) {
        <div class="empty-state">
          <span class="empty-icon">📅</span>
          <span class="empty-text">No events yet</span>
        </div>
      } @else {
        <div class="timeline-container">
          @for (event of visibleEvents(); track event.id; let isLast = $last) {
            <div
              class="timeline-item"
              [class.expanded]="expandedId() === event.id"
              (click)="toggleExpand(event.id)"
            >
              <!-- Timeline Node -->
              <div class="timeline-node">
                <div
                  class="node-dot"
                  [style.background]="getColor(event.type)"
                  [style.box-shadow]="'0 0 8px ' + getColor(event.type)"
                >
                  <span class="node-icon">{{ getIcon(event.type) }}</span>
                </div>
                @if (!isLast) {
                  <div class="node-line" [style.background]="getColor(event.type)"></div>
                }
              </div>

              <!-- Event Content -->
              <div class="event-content">
                <div class="event-header">
                  <span class="event-label">{{ event.label }}</span>
                  @if (config().showTimestamps) {
                    <span class="event-time">{{ formatTime(event.timestamp) }}</span>
                  }
                </div>

                @if (config().showElapsed && startTime()) {
                  <span class="elapsed-time">+{{ formatElapsed(event.timestamp - startTime()!) }}</span>
                }

                @if (event.description && expandedId() === event.id) {
                  <div class="event-description">{{ event.description }}</div>
                }

                @if (event.description && expandedId() !== event.id) {
                  <div class="event-preview">{{ truncate(event.description, 60) }}</div>
                }
              </div>
            </div>
          }
        </div>

        @if (hasMore()) {
          <button class="show-more-btn" (click)="showMore()">
            Show {{ remainingCount() }} more events
          </button>
        }
      }
    </div>
  `,
  styles: [`
    .timeline-view {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px;
      color: var(--text-muted, #6b7280);
    }

    .empty-icon {
      font-size: 24px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }

    .timeline-container {
      display: flex;
      flex-direction: column;
    }

    /* Timeline Item */
    .timeline-item {
      display: flex;
      gap: 12px;
      padding: 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .timeline-item:hover {
      background: var(--bg-tertiary, #262626);
    }

    .timeline-item.expanded {
      background: var(--bg-secondary, #1a1a1a);
    }

    .compact .timeline-item {
      padding: 4px;
      gap: 8px;
    }

    /* Timeline Node */
    .timeline-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      width: 24px;
    }

    .node-dot {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .compact .node-dot {
      width: 18px;
      height: 18px;
    }

    .node-icon {
      font-size: 10px;
      color: white;
    }

    .compact .node-icon {
      font-size: 8px;
    }

    .node-line {
      width: 2px;
      flex: 1;
      min-height: 16px;
      opacity: 0.3;
      margin: 4px 0;
    }

    /* Event Content */
    .event-content {
      flex: 1;
      min-width: 0;
      padding: 2px 0;
    }

    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .event-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .compact .event-label {
      font-size: 12px;
    }

    .event-time {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    .elapsed-time {
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .event-description {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
      line-height: 1.5;
    }

    .event-preview {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Show More Button */
    .show-more-btn {
      background: var(--bg-tertiary, #262626);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--accent-color, #3b82f6);
      cursor: pointer;
      transition: background 0.2s;
    }

    .show-more-btn:hover {
      background: var(--bg-secondary, #1a1a1a);
    }
  `],
})
export class TimelineViewComponent {
  // Inputs
  events = input.required<TimelineEvent[]>();
  config = input<TimelineConfig>({
    showTimestamps: true,
    showElapsed: true,
    maxEvents: 10,
    groupByType: false,
  });
  compact = input<boolean>(false);

  // Outputs
  eventClick = output<TimelineEvent>();

  // Internal state
  expandedId = signal<string | null>(null);
  visibleCount = signal(10);

  // Computed
  sortedEvents = computed(() => {
    return [...this.events()].sort((a, b) => a.timestamp - b.timestamp);
  });

  startTime = computed(() => {
    const events = this.sortedEvents();
    if (events.length === 0) return null;
    return events[0].timestamp;
  });

  visibleEvents = computed(() => {
    const max = this.config().maxEvents || this.visibleCount();
    return this.sortedEvents().slice(0, max);
  });

  hasMore = computed(() => {
    const max = this.config().maxEvents || this.visibleCount();
    return this.sortedEvents().length > max;
  });

  remainingCount = computed(() => {
    const max = this.config().maxEvents || this.visibleCount();
    return this.sortedEvents().length - max;
  });

  // ============================================
  // Methods
  // ============================================

  getColor(type: TimelineEventType): string {
    return this.config().colorMap?.[type] || COLORS[type] || '#6b7280';
  }

  getIcon(type: TimelineEventType): string {
    return TYPE_ICONS[type] || '•';
  }

  toggleExpand(id: string): void {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
    } else {
      this.expandedId.set(id);
      const event = this.events().find(e => e.id === id);
      if (event) {
        this.eventClick.emit(event);
      }
    }
  }

  showMore(): void {
    this.visibleCount.update(count => count + 10);
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}
