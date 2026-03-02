import {
  Component, input, output, signal, ChangeDetectionStrategy, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SearchFilter {
  key: string;
  label: string;
  options: string[];
}

@Component({
  selector: 'app-search-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search-panel">
      <div class="search-input-row">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input type="text" class="search-input"
          [placeholder]="placeholder()"
          [value]="query()"
          (input)="onInput($event)"
          (keydown.escape)="onClear()" />
        @if (query()) {
          <button class="clear-btn" (click)="onClear()">&#x2715;</button>
        }
      </div>

      @if (filters().length > 0) {
        <div class="filter-row">
          @for (filter of filters(); track filter.key) {
            <div class="filter-group">
              <span class="filter-label">{{ filter.label }}:</span>
              @for (option of filter.options; track option) {
                <button class="filter-chip"
                  [class.active]="isFilterActive(filter.key, option)"
                  (click)="toggleFilter(filter.key, option)">
                  {{ option }}
                </button>
              }
            </div>
          }
        </div>
      }

      <div class="results-area">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .search-panel { display: flex; flex-direction: column; gap: var(--spacing-sm, 8px); }
    .search-input-row {
      display: flex; align-items: center; gap: var(--spacing-sm, 8px);
      padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
      background: var(--bg-secondary, #0c0c0f); border: 1px solid var(--border-color, #2a2a2e);
      border-radius: var(--radius-md, 8px); transition: border-color var(--transition-normal, 0.2s);
      &:focus-within { border-color: var(--primary-color, #f59e0b); }
    }
    .search-icon { color: var(--text-muted, #9a9aa0); flex-shrink: 0; }
    .search-input {
      flex: 1; background: none; border: none; color: var(--text-primary, #fafaf9);
      font-size: 0.875rem; outline: none;
      &::placeholder { color: var(--text-muted, #9a9aa0); }
    }
    .clear-btn {
      background: none; border: none; color: var(--text-muted, #9a9aa0);
      cursor: pointer; font-size: 0.75rem; padding: 2px 4px;
      &:hover { color: var(--text-primary, #fafaf9); }
    }
    .filter-row {
      display: flex; gap: var(--spacing-md, 16px); flex-wrap: wrap;
      padding: 0 var(--spacing-xs, 4px);
    }
    .filter-group { display: flex; align-items: center; gap: 4px; }
    .filter-label {
      font-size: 0.6875rem; color: var(--text-muted, #9a9aa0);
      text-transform: uppercase; font-weight: 600;
    }
    .filter-chip {
      padding: 2px 8px; border-radius: 999px; font-size: 0.6875rem;
      background: var(--bg-tertiary, #111114); border: 1px solid var(--border-color, #2a2a2e);
      color: var(--text-secondary, #c4c4c9); cursor: pointer;
      transition: all var(--transition-fast, 0.1s);
      &:hover { border-color: var(--primary-color, #f59e0b); }
      &.active { border-color: var(--primary-color, #f59e0b); color: var(--primary-color, #f59e0b); background: rgba(245,158,11,0.08); }
    }
    .results-area { min-height: 100px; }
  `]
})
export class SearchPanelComponent implements OnDestroy {
  readonly placeholder = input('Search...');
  readonly debounceMs = input(300);
  readonly filters = input<SearchFilter[]>([]);
  readonly searchChange = output<string>();
  readonly filterChange = output<Record<string, string[]>>();

  readonly query = signal('');
  readonly activeFilters = signal<Record<string, Set<string>>>({});

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.searchChange.emit(value), this.debounceMs());
  }

  onClear(): void {
    this.query.set('');
    this.searchChange.emit('');
  }

  isFilterActive(key: string, option: string): boolean {
    return this.activeFilters()[key]?.has(option) ?? false;
  }

  toggleFilter(key: string, option: string): void {
    this.activeFilters.update(prev => {
      const next = { ...prev };
      if (!next[key]) next[key] = new Set();
      else next[key] = new Set(next[key]);
      if (next[key].has(option)) next[key].delete(option);
      else next[key].add(option);
      return next;
    });
    const result: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(this.activeFilters())) {
      result[k] = [...v];
    }
    this.filterChange.emit(result);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
