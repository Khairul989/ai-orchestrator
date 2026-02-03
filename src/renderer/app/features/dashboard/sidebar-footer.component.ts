/**
 * Sidebar Footer Component
 * Footer section of the dashboard sidebar with stats and close all button
 */

import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { InstanceStore } from '../../core/state/instance.store';

@Component({
  selector: 'app-sidebar-footer',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sidebar-footer">
      <div class="stats">
        <span class="stat">
          {{ store.instanceCount() }} instances
        </span>
        @if (store.totalContextUsage().total > 0) {
          <span class="stat">
            {{
              store.totalContextUsage().percentage | number: '1.0-0'
            }}% context
          </span>
        }
        @if (store.totalContextUsage().costEstimate) {
          <span class="stat cost-stat">
            ~\${{
              store.totalContextUsage().costEstimate | number: '1.2-2'
            }}
          </span>
        }
      </div>
      @if (store.instanceCount() > 0) {
        <button
          class="btn-close-all"
          (click)="closeAllClicked.emit()"
          title="Close all instances"
        >
          Close All
        </button>
      }
    </div>
  `,
  styleUrl: './sidebar-footer.component.scss'
})
export class SidebarFooterComponent {
  store = inject(InstanceStore);

  // Output events
  closeAllClicked = output<void>();
}
