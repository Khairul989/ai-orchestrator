/**
 * Instance Row Component - Single instance in the hierarchical tree list
 */

import {
  Component,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Instance, InstanceStatus } from '../../core/state/instance.store';
import { StatusIndicatorComponent } from './status-indicator.component';
import { ContextBarComponent } from '../instance-detail/context-bar.component';
import { getAgentById, getDefaultAgent } from '../../../../shared/types/agent.types';

@Component({
  selector: 'app-instance-row',
  standalone: true,
  imports: [StatusIndicatorComponent, ContextBarComponent],
  template: `
    <div
      class="instance-row"
      [class.selected]="isSelected()"
      [class.error]="instance().status === 'error'"
      [class.yolo]="instance().yoloMode"
      [class.is-child]="depth() > 0"
      [style.padding-left.px]="12 + depth() * 20"
      (click)="select.emit(instance().id)"
    >
      <!-- Expand/collapse button for parents, child indicator, or placeholder -->
      @if (hasChildren()) {
        <button
          class="expand-btn"
          [class.expanded]="isExpanded()"
          (click)="onToggleExpand($event)"
          title="{{ isExpanded() ? 'Collapse' : 'Expand' }} children"
        >
          <span class="chevron">›</span>
        </button>
      } @else if (depth() > 0) {
        <span class="child-connector">└</span>
      } @else {
        <!-- Placeholder to reserve space for expand button on root instances -->
        <span class="expand-placeholder"></span>
      }

      <app-status-indicator [status]="instance().status" />

      <div class="instance-info">
        <div class="instance-name-row">
          <span class="agent-badge" [style.background-color]="agent().color" [title]="agent().description">
            {{ agent().name.charAt(0) }}
          </span>
          <span class="instance-name">{{ instance().displayName }}</span>
          @if (hasChildren() && !isExpanded()) {
            <span class="collapsed-badge">+{{ instance().childrenIds.length }}</span>
          }
        </div>
        <div class="instance-meta">
          <span class="session-id mono">{{ instance().sessionId.slice(0, 8) }}...</span>
        </div>
      </div>

      <app-context-bar
        [usage]="instance().contextUsage"
        [compact]="true"
      />

      <div class="instance-actions">
        <button
          class="action-btn restart"
          title="Restart instance"
          (click)="onRestart($event)"
          [disabled]="instance().status === 'initializing'"
        >
          ↻
        </button>
        <button
          class="action-btn terminate"
          title="Terminate instance"
          (click)="onTerminate($event)"
        >
          ×
        </button>
      </div>
    </div>
  `,
  styles: [`
    .instance-row {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 10px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-color);
      transition: background-color var(--transition-fast);
      height: 72px;
    }

    .instance-row:hover {
      background-color: var(--bg-hover);
    }

    .instance-row.selected {
      background-color: var(--bg-selected);
      border-left: 3px solid var(--primary-color);
    }

    .instance-row.error {
      background-color: var(--error-bg);
    }

    .instance-row.yolo {
      border-left: 3px solid #f59e0b;

      &.selected {
        border-left: 3px solid #f59e0b;
        box-shadow: inset 3px 0 0 var(--primary-color);
      }
    }

    /* Child instance styling */
    .instance-row.is-child {
      background-color: rgba(99, 102, 241, 0.05);
    }

    .instance-row.is-child:hover {
      background-color: var(--bg-hover);
    }

    .instance-row.is-child.selected {
      background-color: var(--bg-selected);
    }

    /* Child connector character */
    .child-connector {
      color: var(--border-color);
      font-size: 14px;
      width: 18px;
      text-align: center;
      flex-shrink: 0;
    }

    /* Placeholder for consistent alignment */
    .expand-placeholder {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    /* Expand/collapse button */
    .expand-btn {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: all var(--transition-fast);
      flex-shrink: 0;
      color: var(--text-secondary);
    }

    .expand-btn:hover {
      background: var(--bg-hover);
      border-color: var(--primary-color);
      color: var(--primary-color);
    }

    .expand-btn .chevron {
      font-size: 12px;
      font-weight: bold;
      line-height: 1;
      transition: transform var(--transition-fast);
    }

    .expand-btn.expanded .chevron {
      transform: rotate(90deg);
    }

    .instance-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .instance-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .agent-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
    }

    .instance-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-primary);
      flex: 1;
      min-width: 0;
    }

    .collapsed-badge {
      background: var(--primary-color);
      color: white;
      font-size: 9px;
      font-weight: 600;
      padding: 2px 5px;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .instance-meta {
      display: flex;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .session-id {
      color: var(--text-muted);
    }

    .instance-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity var(--transition-fast);
      flex-shrink: 0;
    }

    .instance-row:hover .instance-actions {
      opacity: 1;
    }

    .action-btn {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: background-color var(--transition-fast);
    }

    .action-btn.restart {
      background: var(--bg-tertiary);
      color: var(--text-primary);

      &:hover:not(:disabled) {
        background: var(--bg-hover);
      }
    }

    .action-btn.terminate {
      background: var(--error-bg);
      color: var(--error-color);

      &:hover:not(:disabled) {
        background: var(--error-color);
        color: white;
      }
    }

    .action-btn:disabled {
      opacity: 0.3;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstanceRowComponent {
  // Required inputs
  instance = input.required<Instance>();

  // Hierarchy inputs
  depth = input<number>(0);
  hasChildren = input<boolean>(false);
  isExpanded = input<boolean>(false);
  isLastChild = input<boolean>(false);
  parentChain = input<boolean[]>([]);

  // Selection state
  isSelected = input<boolean>(false);

  // Outputs
  select = output<string>();
  terminate = output<string>();
  restart = output<string>();
  toggleExpand = output<string>();

  // Computed agent profile from instance's agentId
  agent = computed(() => {
    const agentId = this.instance().agentId;
    return agentId ? getAgentById(agentId) || getDefaultAgent() : getDefaultAgent();
  });

  onTerminate(event: Event): void {
    event.stopPropagation();
    this.terminate.emit(this.instance().id);
  }

  onRestart(event: Event): void {
    event.stopPropagation();
    this.restart.emit(this.instance().id);
  }

  onToggleExpand(event: Event): void {
    event.stopPropagation();
    this.toggleExpand.emit(this.instance().id);
  }
}
