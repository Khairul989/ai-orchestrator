/**
 * Display Settings Tab Component - Theme, font, UI settings
 */

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SettingsStore } from '../../core/state/settings.store';
import { ViewLayoutService } from '../../core/services/view-layout.service';
import { SettingRowComponent } from './setting-row.component';
import type { AppSettings } from '../../../../shared/types/settings.types';

@Component({
  selector: 'app-display-settings-tab',
  standalone: true,
  imports: [SettingRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (setting of store.displaySettings(); track setting.key) {
      <app-setting-row
        [setting]="setting"
        [value]="store.get(setting.key)"
        (valueChange)="onSettingChange($event)"
      />
    }

    <!-- Reset View Layout Section -->
    <div class="setting-row reset-layout-row">
      <div class="setting-info">
        <h3 class="setting-label">Reset View Layout</h3>
        <p class="setting-description">
          Reset sidebar and file explorer panel widths to their default
          positions. This will not affect other settings.
        </p>
      </div>
      <div class="setting-control">
        <button class="btn-reset-layout" (click)="resetViewLayout()">
          Reset Layout
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .setting-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--spacing-lg);
        padding: var(--spacing-md);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
      }

      .setting-info {
        flex: 1;
      }

      .setting-label {
        display: block;
        font-weight: 500;
        margin-bottom: var(--spacing-xs);
        color: var(--text-primary);
      }

      .setting-description {
        margin: 0;
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.4;
      }

      .setting-control {
        flex-shrink: 0;
        min-width: 150px;
      }

      .reset-layout-row {
        border: 1px dashed var(--border-color);
        background: var(--bg-tertiary);
      }

      .btn-reset-layout {
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: var(--radius-sm);
        font-weight: 500;
        font-size: 13px;
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;

        &:hover {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: white;
        }
      }
    `
  ]
})
export class DisplaySettingsTabComponent {
  store = inject(SettingsStore);
  private viewLayoutService = inject(ViewLayoutService);

  onSettingChange(event: { key: string; value: unknown }): void {
    this.store.set(event.key as keyof AppSettings, event.value as AppSettings[keyof AppSettings]);
  }

  resetViewLayout(): void {
    this.viewLayoutService.reset();
  }
}
