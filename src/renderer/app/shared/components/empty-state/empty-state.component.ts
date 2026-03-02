import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <div class="empty-icon" [innerHTML]="icon()"></div>
      <h3 class="empty-title">{{ title() }}</h3>
      <p class="empty-message">{{ message() }}</p>
      @if (actionLabel()) {
        <button class="empty-action" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: var(--spacing-3xl, 48px) var(--spacing-xl, 32px);
      text-align: center; animation: fadeIn 0.3s ease;
    }
    .empty-icon {
      color: var(--text-muted, #9a9aa0); opacity: 0.5; margin-bottom: var(--spacing-md, 16px);
    }
    .empty-title {
      font-size: 1rem; font-weight: 600; color: var(--text-primary, #fafaf9);
      margin: 0 0 var(--spacing-xs, 4px);
    }
    .empty-message {
      font-size: 0.8125rem; color: var(--text-muted, #9a9aa0);
      max-width: 320px; margin: 0 0 var(--spacing-lg, 24px); line-height: 1.5;
    }
    .empty-action {
      padding: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
      background: var(--primary-color, #f59e0b); color: #000; border: none;
      border-radius: var(--radius-sm, 4px); font-size: 0.8125rem; font-weight: 600;
      cursor: pointer; transition: background var(--transition-fast, 0.1s);
      &:hover { background: var(--primary-hover, #fbbf24); }
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class EmptyStateComponent {
  readonly icon = input('<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>');
  readonly title = input('Nothing here yet');
  readonly message = input('');
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}
