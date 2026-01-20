/**
 * Thought Process Component - Collapsible panel showing Claude's thinking
 *
 * Displays intermediate thinking steps in an expandable section,
 * similar to claude.ai's "Thought process" UI.
 */

import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-thought-process',
  standalone: true,
  template: `
    <div class="thought-process" [class.expanded]="isExpanded()">
      <button class="thought-header" (click)="toggle()">
        <span class="thought-icon">{{ isExpanded() ? '▼' : '▶' }}</span>
        <span class="thought-label">{{ label() }}</span>
        <span class="thought-chevron">{{ isExpanded() ? '−' : '+' }}</span>
      </button>
      @if (isExpanded()) {
        <div class="thought-content">
          @for (thought of thoughts(); track $index) {
            <div class="thought-item">{{ thought }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .thought-process {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .thought-header {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-secondary);
      text-align: left;
      transition: all 0.15s ease;

      &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
    }

    .thought-icon {
      font-size: 10px;
      opacity: 0.6;
      width: 12px;
    }

    .thought-label {
      flex: 1;
      font-weight: 500;
    }

    .thought-chevron {
      font-size: 16px;
      opacity: 0.5;
      font-weight: 300;
    }

    .thought-content {
      padding: 0 14px 14px 34px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
      border-top: 1px solid var(--border-color);
      padding-top: 12px;
      margin-top: 0;
    }

    .thought-item {
      padding: 6px 0;

      &:not(:last-child) {
        border-bottom: 1px dashed var(--border-color);
        padding-bottom: 10px;
        margin-bottom: 4px;
      }
    }

    .thought-process.expanded {
      .thought-header {
        color: var(--text-primary);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThoughtProcessComponent {
  thoughts = input.required<string[]>();
  label = input<string>('Thought process');
  defaultExpanded = input<boolean>(false);

  isExpanded = signal(false);

  constructor() {
    // Initialize expanded state from input
    setTimeout(() => {
      this.isExpanded.set(this.defaultExpanded());
    });
  }

  toggle(): void {
    this.isExpanded.update(v => !v);
  }
}
