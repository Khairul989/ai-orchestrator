/**
 * Keyboard Settings Tab Component - Displays keyboard shortcuts
 */

import { ChangeDetectionStrategy, Component, inject, computed } from '@angular/core';
import { KeybindingService } from '../../core/services/keybinding.service';
import type { KeyBinding } from '../../../../shared/types/keybinding.types';

interface KeybindingCategory {
  name: string;
  bindings: KeyBinding[];
}

@Component({
  selector: 'app-keyboard-settings-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="keyboard-shortcuts-section">
      <p class="keyboard-intro">
        These keyboard shortcuts help you work faster. Press the shortcut
        combination shown to trigger the action.
      </p>
      @for (category of keybindingCategories(); track category.name) {
        <div class="shortcut-category">
          <h3 class="category-title">{{ category.name }}</h3>
          <div class="shortcut-list">
            @for (binding of category.bindings; track binding.id) {
              <div class="shortcut-row">
                <div class="shortcut-info">
                  <span class="shortcut-name">{{ binding.name }}</span>
                  <span class="shortcut-desc">{{ binding.description }}</span>
                </div>
                <div class="shortcut-keys">
                  <kbd>{{ keybindingService.formatBinding(binding) }}</kbd>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .keyboard-shortcuts-section {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-lg);
      }

      .keyboard-intro {
        margin: 0;
        color: var(--text-secondary);
        font-size: 13px;
        line-height: 1.5;
      }

      .shortcut-category {
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        padding: var(--spacing-md);
      }

      .category-title {
        margin: 0 0 var(--spacing-sm);
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: var(--spacing-xs);
      }

      .shortcut-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
      }

      .shortcut-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);

        &:hover {
          background: var(--bg-tertiary);
        }
      }

      .shortcut-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .shortcut-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .shortcut-desc {
        font-size: 11px;
        color: var(--text-muted);
      }

      .shortcut-keys {
        flex-shrink: 0;
      }

      .shortcut-keys kbd {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--text-primary);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      }
    `
  ]
})
export class KeyboardSettingsTabComponent {
  keybindingService = inject(KeybindingService);

  keybindingCategories = computed(() => {
    const byCategory = this.keybindingService.bindingsByCategory();
    const categories: KeybindingCategory[] = [];
    byCategory.forEach((bindings, name) => {
      categories.push({ name, bindings });
    });
    return categories;
  });
}
