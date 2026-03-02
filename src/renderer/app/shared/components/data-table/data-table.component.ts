import {
  Component, input, output, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ColumnDef<T = unknown> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T) => string;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrapper">
      @if (filterable()) {
        <div class="table-filter">
          <input
            type="text"
            class="filter-input"
            [placeholder]="filterPlaceholder()"
            [value]="filterText()"
            (input)="onFilterInput($event)" />
        </div>
      }

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              @for (col of columns(); track col.key) {
                <th
                  [style.width]="col.width || 'auto'"
                  [style.text-align]="col.align || 'left'"
                  [class.sortable]="col.sortable"
                  [class.sorted]="sort()?.column === col.key"
                  (click)="col.sortable ? toggleSort(col.key) : null">
                  {{ col.label }}
                  @if (col.sortable) {
                    <span class="sort-icon">
                      @if (sort()?.column === col.key) {
                        {{ sort()?.direction === 'asc' ? '\u2191' : '\u2193' }}
                      } @else {
                        \u2195
                      }
                    </span>
                  }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              @for (i of skeletonRows; track i) {
                <tr class="skeleton-row">
                  @for (col of columns(); track col.key) {
                    <td><div class="skeleton-cell"></div></td>
                  }
                </tr>
              }
            } @else if (pagedData().length === 0) {
              <tr class="empty-row">
                <td [attr.colspan]="columns().length">
                  <div class="empty-state">{{ emptyMessage() }}</div>
                </td>
              </tr>
            } @else {
              @for (row of pagedData(); track trackBy(row); let i = $index) {
                <tr
                  [class.selected]="selectedIndex() === i"
                  [class.even]="i % 2 === 0"
                  (click)="onRowClick(row, i)">
                  @for (col of columns(); track col.key) {
                    <td [style.text-align]="col.align || 'left'">
                      {{ getCellValue(row, col) }}
                    </td>
                  }
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      @if (totalPages() > 1) {
        <div class="table-pagination">
          <span class="page-info">
            {{ paginationStart() + 1 }}\u2013{{ paginationEnd() }} of {{ filteredData().length }}
          </span>
          <div class="page-buttons">
            <button [disabled]="currentPage() === 0" (click)="prevPage()">\u2190 Prev</button>
            <button [disabled]="currentPage() >= totalPages() - 1" (click)="nextPage()">Next \u2192</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .table-wrapper {
      border: 1px solid var(--border-color, #2a2a2e); border-radius: var(--radius-md, 8px);
      overflow: hidden; background: var(--bg-secondary, #0c0c0f);
    }
    .table-filter {
      padding: var(--spacing-sm, 8px); border-bottom: 1px solid var(--border-color, #2a2a2e);
    }
    .filter-input {
      width: 100%; padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
      background: var(--bg-tertiary, #111114); border: 1px solid var(--border-color, #2a2a2e);
      border-radius: var(--radius-sm, 4px); color: var(--text-primary, #fafaf9);
      font-size: 0.8125rem; outline: none;
      &:focus { border-color: var(--primary-color, #f59e0b); }
    }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    thead { position: sticky; top: 0; z-index: 1; }
    th {
      padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
      background: var(--bg-tertiary, #111114); color: var(--text-secondary, #c4c4c9);
      font-weight: 600; text-transform: uppercase; font-size: 0.6875rem;
      letter-spacing: 0.05em; border-bottom: 1px solid var(--border-color, #2a2a2e);
      user-select: none; white-space: nowrap;
      &.sortable { cursor: pointer; &:hover { color: var(--primary-color, #f59e0b); } }
      &.sorted { color: var(--primary-color, #f59e0b); }
    }
    .sort-icon { margin-left: 4px; opacity: 0.5; }
    td {
      padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
      color: var(--text-primary, #fafaf9); border-bottom: 1px solid var(--border-subtle, #1a1a1e);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;
    }
    tr { transition: background var(--transition-fast, 0.1s); }
    tr.even { background: rgba(255,255,255,0.01); }
    tr:hover:not(.skeleton-row):not(.empty-row) {
      background: rgba(245, 158, 11, 0.05); cursor: pointer;
    }
    tr.selected { background: rgba(245, 158, 11, 0.1); }
    .skeleton-cell {
      height: 16px; background: var(--bg-tertiary, #111114); border-radius: 4px;
      animation: shimmer 1.5s infinite;
    }
    .empty-state {
      padding: var(--spacing-2xl, 32px); text-align: center;
      color: var(--text-muted, #9a9aa0);
    }
    .table-pagination {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
      border-top: 1px solid var(--border-color, #2a2a2e);
    }
    .page-info { color: var(--text-muted, #9a9aa0); font-size: 0.75rem; }
    .page-buttons { display: flex; gap: var(--spacing-xs, 4px); }
    .page-buttons button {
      padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
      background: var(--bg-tertiary, #111114); border: 1px solid var(--border-color, #2a2a2e);
      border-radius: var(--radius-sm, 4px); color: var(--text-secondary, #c4c4c9);
      font-size: 0.75rem; cursor: pointer;
      &:hover:not(:disabled) { border-color: var(--primary-color, #f59e0b); color: var(--primary-color, #f59e0b); }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }
    @keyframes shimmer {
      0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; }
    }
  `]
})
export class DataTableComponent<T = Record<string, unknown>> {
  readonly columns = input.required<ColumnDef<T>[]>();
  readonly data = input<T[]>([]);
  readonly pageSize = input(25);
  readonly loading = input(false);
  readonly emptyMessage = input('No data');
  readonly filterable = input(false);
  readonly filterPlaceholder = input('Filter...');
  readonly trackByKey = input('id');
  readonly rowClick = output<T>();
  readonly sortChange = output<SortState>();

  readonly filterText = signal('');
  readonly currentPage = signal(0);
  readonly selectedIndex = signal<number | null>(null);
  readonly sort = signal<SortState | null>(null);
  readonly skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  readonly filteredData = computed(() => {
    let items = [...this.data()];
    const filter = this.filterText().toLowerCase();
    if (filter) {
      items = items.filter(row =>
        this.columns().some(col => {
          const val = (row as Record<string, unknown>)[col.key];
          return val != null && String(val).toLowerCase().includes(filter);
        })
      );
    }
    const s = this.sort();
    if (s) {
      items.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[s.column];
        const bVal = (b as Record<string, unknown>)[s.column];
        const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { numeric: true });
        return s.direction === 'asc' ? cmp : -cmp;
      });
    }
    return items;
  });

  readonly totalPages = computed(() => Math.ceil(this.filteredData().length / this.pageSize()));
  readonly paginationStart = computed(() => this.currentPage() * this.pageSize());
  readonly paginationEnd = computed(() => Math.min(this.paginationStart() + this.pageSize(), this.filteredData().length));
  readonly pagedData = computed(() =>
    this.filteredData().slice(this.paginationStart(), this.paginationEnd())
  );

  onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
    this.currentPage.set(0);
  }

  toggleSort(column: string): void {
    const current = this.sort();
    if (current?.column === column) {
      const next: SortState = { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      this.sort.set(next);
      this.sortChange.emit(next);
    } else {
      const next: SortState = { column, direction: 'asc' };
      this.sort.set(next);
      this.sortChange.emit(next);
    }
  }

  onRowClick(row: T, index: number): void {
    this.selectedIndex.set(index);
    this.rowClick.emit(row);
  }

  prevPage(): void { this.currentPage.update(p => Math.max(0, p - 1)); }
  nextPage(): void { this.currentPage.update(p => Math.min(this.totalPages() - 1, p + 1)); }

  trackBy(row: T): unknown {
    return (row as Record<string, unknown>)[this.trackByKey()] ?? row;
  }

  getCellValue(row: T, col: ColumnDef<T>): string {
    const val = (row as Record<string, unknown>)[col.key];
    return col.render ? col.render(val, row) : (val != null ? String(val) : '\u2014');
  }
}
