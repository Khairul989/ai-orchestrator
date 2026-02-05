/**
 * Instance Header Component - Header with status, badges, and actions
 */

import {
  Component,
  input,
  output,
  computed,
  inject,
  OnInit,
  ChangeDetectionStrategy
} from '@angular/core';
import { StatusIndicatorComponent } from '../instance-list/status-indicator.component';
import { RecentDirectoriesDropdownComponent } from '../../shared/components/recent-directories-dropdown/recent-directories-dropdown.component';
import { SkillStore } from '../../core/state/skill.store';
import { HookStore } from '../../core/state/hook.store';
import type { Instance } from '../../core/state/instance.store';
import { getModelShortName } from '../../../../shared/types/provider.types';
import type { ModelDisplayInfo } from '../../../../shared/types/provider.types';

@Component({
  selector: 'app-instance-header',
  standalone: true,
  imports: [StatusIndicatorComponent, RecentDirectoriesDropdownComponent],
  template: `
    <div class="detail-header">
      <div class="instance-identity">
        <div class="name-row">
          <app-status-indicator [status]="instance().status" />
          @if (isEditingName()) {
            <input
              type="text"
              class="name-input"
              [value]="instance().displayName"
              (keydown.enter)="onSaveName($event)"
              (keydown.escape)="cancelEditName.emit()"
              (blur)="onSaveName($event)"
              #nameInput
            />
          } @else {
            <h2
              class="instance-name editable"
              title="Double-click to rename"
              role="button"
              tabindex="0"
              (dblclick)="startEditName.emit()"
              (keydown.enter)="startEditName.emit()"
              (keydown.space)="startEditName.emit()"
            >
              {{ instance().displayName }}
              <span class="edit-icon">✏️</span>
            </h2>
          }
        </div>
        <div class="instance-meta">
          <span
            class="provider-badge"
            [style.background-color]="providerColor()"
            [title]="'Provider: ' + providerDisplayName()"
          >
            {{ providerDisplayName() }}
          </span>
          @if (availableModels().length > 0) {
            <div class="model-selector-inline">
              <button
                class="model-btn"
                [style.border-color]="modelBtnBorderColor()"
                [style.background]="modelBtnBgColor()"
                [style.color]="providerColor()"
                [disabled]="instance().status === 'busy' || instance().status === 'respawning'"
                (click)="$event.stopPropagation(); toggleModelDropdown.emit()"
                [title]="'Model: ' + currentModelId()"
              >
                {{ currentModelDisplayName() }}
                <span class="dropdown-caret">▼</span>
              </button>
              @if (showModelDropdown()) {
                <div class="model-dropdown">
                  @for (model of availableModels(); track model.id) {
                    <button
                      class="model-option"
                      [class.selected]="model.id === currentModelId()"
                      (click)="selectModel.emit(model.id)"
                    >
                      <span class="model-name">{{ model.name }}</span>
                      <span class="model-tier" [class]="'tier-' + model.tier">{{ model.tier }}</span>
                      @if (model.id === currentModelId()) {
                        <span class="check">✓</span>
                      }
                    </button>
                  }
                </div>
              }
            </div>
            @if (showModelDropdown()) {
              <button
                type="button"
                class="model-backdrop"
                aria-label="Close model menu"
                (click)="closeModelDropdown.emit()"
              ></button>
            }
          }
          <span class="separator">•</span>
          <button
            class="mode-badge"
            [class.plan]="instance().agentId === 'plan'"
            [class.review]="instance().agentId === 'review'"
            [disabled]="isChangingMode() || instance().status === 'busy' || instance().status === 'respawning'"
            [title]="
              instance().status === 'busy' || instance().status === 'respawning'
                ? 'Cannot change mode while instance is busy'
                : 'Click to change mode'
            "
            (click)="cycleAgentMode.emit()"
          >
            {{ agentModeIcon() }}
            {{ agentModeName() }}
          </button>
          <span class="separator">•</span>
          <app-recent-directories-dropdown
            [currentPath]="instance().workingDirectory || ''"
            (folderSelected)="selectFolder.emit($event)"
          />
          <span class="separator">•</span>
          <button
            class="yolo-badge"
            [class.active]="instance().yoloMode"
            [disabled]="isTogglingYolo() || instance().status === 'busy' || instance().status === 'respawning'"
            [title]="
              instance().status === 'busy' || instance().status === 'respawning'
                ? 'Cannot toggle YOLO mode while instance is busy'
                : instance().yoloMode
                  ? 'YOLO Mode: Auto-approve all tool calls without prompting. Click to disable'
                  : 'YOLO Mode: Requires manual approval for tool calls. Click to enable auto-approve'
            "
            (click)="toggleYolo.emit()"
          >
            ⚡ YOLO {{ instance().yoloMode ? 'ON' : 'OFF' }}
          </button>
          @if (activeSkillCount() > 0 || enabledHookCount() > 0) {
            <span class="separator">•</span>
          }
          @if (activeSkillCount() > 0) {
            <span
              class="skills-badge"
              [title]="activeSkillsTooltip()"
            >
              🧩 {{ activeSkillCount() }} skill{{ activeSkillCount() > 1 ? 's' : '' }}
            </span>
          }
          @if (enabledHookCount() > 0) {
            <span
              class="hooks-badge"
              [title]="enabledHooksTooltip()"
            >
              🪝 {{ enabledHookCount() }} hook{{ enabledHookCount() > 1 ? 's' : '' }}
            </span>
          }
        </div>
      </div>

      <div class="header-actions">
        @if (instance().status === 'busy') {
          <button
            class="btn-action btn-interrupt"
            title="Interrupt Claude (Esc)"
            (click)="interrupt.emit()"
          >
            ⏸ Interrupt
          </button>
        }
        <button
          class="btn-action"
          title="Restart instance"
          (click)="restart.emit()"
          [disabled]="instance().status === 'initializing' || instance().status === 'respawning'"
        >
          ↻ Restart
        </button>
        <button
          class="btn-action btn-danger"
          title="Terminate instance"
          (click)="terminate.emit()"
        >
          × Terminate
        </button>
        <button
          class="btn-action btn-primary"
          title="Create child instance"
          (click)="createChild.emit()"
        >
          + Child
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--spacing-lg);
        padding-bottom: var(--spacing-md);
        border-bottom: 1px solid var(--border-subtle);
      }

      .instance-identity {
        flex: 1;
        min-width: 0;
      }

      .name-row {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
      }

      .instance-name {
        font-family: var(--font-display);
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0;
        color: var(--text-primary);

        &.editable {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          padding: 2px 4px;
          border-radius: var(--radius-sm);
          transition: background var(--transition-fast);

          &:hover {
            background: var(--bg-hover);
          }

          .edit-icon {
            opacity: 0;
            font-size: 14px;
            transition: opacity var(--transition-fast);
          }

          &:hover .edit-icon {
            opacity: 0.6;
          }
        }
      }

      .name-input {
        font-family: var(--font-display);
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        padding: 4px 10px;
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
        color: var(--text-primary);
        outline: none;
        min-width: 200px;
        box-shadow: 0 0 0 4px rgba(var(--primary-rgb), 0.15);
      }

      .instance-meta {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: var(--spacing-sm);
        flex-wrap: wrap;
      }

      .separator {
        color: var(--border-color);
        font-size: 8px;
      }

      .working-dir-btn {
        max-width: 300px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.02em;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        padding: 4px 10px;
        color: var(--text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &:hover {
          border-color: var(--primary-color);
          color: var(--text-primary);
          background: rgba(var(--primary-rgb), 0.1);
        }
      }

      .provider-badge {
        padding: 4px 10px;
        border: none;
        border-radius: 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      /* Inline Model Selector */
      .model-selector-inline {
        position: relative;
        display: inline-block;
        margin-left: 6px;
      }

      .model-btn {
        padding: 4px 10px;
        border: 1px solid;
        border-radius: 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .model-btn:hover:not(:disabled) {
        filter: brightness(1.2);
      }

      .model-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .dropdown-caret {
        font-size: 8px;
        opacity: 0.7;
      }

      .model-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        min-width: 180px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
      }

      .model-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-family: var(--font-mono);
        font-size: 11px;
        cursor: pointer;
        text-align: left;
        transition: background var(--transition-fast);
      }

      .model-option:hover {
        background: var(--bg-tertiary);
      }

      .model-option.selected {
        background: var(--bg-tertiary);
        color: var(--primary-color);
      }

      .model-option .check {
        color: var(--primary-color);
        font-size: 12px;
      }

      .model-name {
        flex: 1;
      }

      .model-tier {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 1px 5px;
        border-radius: 4px;
        margin-right: 6px;
        opacity: 0.7;
      }

      .tier-powerful {
        color: #f59e0b;
      }

      .tier-balanced {
        color: #10b981;
      }

      .tier-fast {
        color: #60a5fa;
      }

      .model-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999;
        background: transparent;
        border: none;
      }

      .mode-badge {
        padding: 4px 10px;
        border: none;
        border-radius: 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        cursor: pointer;
        transition: all var(--transition-fast);
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);

        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        &.plan {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
          &:hover {
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
          }
        }

        &.review {
          background: linear-gradient(
            135deg,
            var(--primary-color) 0%,
            var(--primary-hover) 100%
          );
          box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.3);
          &:hover {
            box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.4);
          }
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
      }

      .yolo-badge {
        padding: 4px 10px;
        border: 1px solid var(--border-subtle);
        border-radius: 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        background: var(--bg-tertiary);
        color: var(--text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--bg-hover);
          border-color: var(--border-color);
        }

        &.active {
          background: linear-gradient(135deg, var(--primary-color), #ef4444);
          border: none;
          color: var(--bg-primary);
          box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.4);
          animation: glow 2s ease-in-out infinite;

          &:hover {
            box-shadow: 0 4px 16px rgba(var(--primary-rgb), 0.5);
          }
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .skills-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
        box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
      }

      .hooks-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
      }

      @keyframes glow {
        0%,
        100% {
          box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.4);
        }
        50% {
          box-shadow: 0 2px 16px rgba(var(--primary-rgb), 0.6);
        }
      }

      .header-actions {
        display: flex;
        gap: var(--spacing-xs);
      }

      .btn-action {
        padding: var(--spacing-sm) var(--spacing-md);
        border-radius: var(--radius-md);
        font-family: var(--font-display);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-subtle);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover:not(:disabled) {
          background: var(--bg-hover);
          border-color: var(--border-color);
          color: var(--text-primary);
        }

        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }

      .btn-danger {
        color: var(--error-color);
        border-color: rgba(var(--error-rgb), 0.3);

        &:hover:not(:disabled) {
          background: rgba(var(--error-rgb), 0.1);
          border-color: var(--error-color);
          box-shadow: 0 0 12px rgba(var(--error-rgb), 0.2);
        }
      }

      .btn-interrupt {
        background: rgba(var(--primary-rgb), 0.15);
        color: var(--primary-color);
        border: 1px solid rgba(var(--primary-rgb), 0.4);
        animation: pulse 1.5s ease-in-out infinite;

        &:hover:not(:disabled) {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: var(--bg-primary);
          box-shadow: 0 0 16px rgba(var(--primary-rgb), 0.5);
        }
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.7;
        }
      }

      .btn-primary {
        background: linear-gradient(
          135deg,
          var(--primary-color) 0%,
          var(--primary-hover) 100%
        );
        border: none;
        color: var(--bg-primary);
        box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.3);

        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.4);
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InstanceHeaderComponent implements OnInit {
  private skillStore = inject(SkillStore);
  private hookStore = inject(HookStore);

  instance = input.required<Instance>();
  isEditingName = input(false);
  isChangingMode = input(false);
  isTogglingYolo = input(false);
  showModelDropdown = input(false);
  currentModel = input<string | undefined>(undefined);
  models = input<ModelDisplayInfo[]>([]);

  // Skills and hooks counts
  activeSkillCount = computed(() => this.skillStore.activeSkillCount());
  enabledHookCount = computed(() => this.hookStore.enabledHookCount());

  // Tooltips for badges
  activeSkillsTooltip = computed(() => {
    const skills = this.skillStore.getActiveSkillBundles();
    if (skills.length === 0) return '';
    return 'Active skills:\n' + skills.map(s => `• ${s.metadata.name}`).join('\n');
  });

  enabledHooksTooltip = computed(() => {
    const hooks = this.hookStore.enabledHooks();
    if (hooks.length === 0) return '';
    return 'Enabled hooks:\n' + hooks.map(h => `• ${h.name}`).join('\n');
  });

  ngOnInit(): void {
    // Load skills and hooks on init
    this.skillStore.discoverSkills();
    this.hookStore.loadHooks();
  }

  // Actions
  startEditName = output<void>();
  cancelEditName = output<void>();
  saveName = output<string>();
  cycleAgentMode = output<void>();
  toggleYolo = output<void>();
  selectFolder = output<string>();
  interrupt = output<void>();
  restart = output<void>();
  terminate = output<void>();
  createChild = output<void>();
  toggleModelDropdown = output<void>();
  closeModelDropdown = output<void>();
  selectModel = output<string>();

  providerDisplayName = computed(() => {
    return this.getProviderDisplayName(this.instance().provider);
  });

  providerColor = computed(() => {
    return this.getProviderColor(this.instance().provider);
  });

  availableModels = computed((): ModelDisplayInfo[] => {
    return this.models();
  });

  currentModelId = computed(() => {
    return this.currentModel() || this.availableModels()[0]?.id || '';
  });

  currentModelDisplayName = computed(() => {
    const modelId = this.currentModelId();
    // First try dynamic models list
    const models = this.availableModels();
    const match = models.find(m => m.id === modelId);
    if (match) return match.name;
    // Fall back to static lookup
    const provider = this.instance().provider;
    return getModelShortName(modelId, provider);
  });

  modelBtnBorderColor = computed(() => {
    const color = this.getProviderColor(this.instance().provider);
    return color + '4D'; // 30% opacity hex
  });

  modelBtnBgColor = computed(() => {
    const color = this.getProviderColor(this.instance().provider);
    return color + '26'; // 15% opacity hex
  });

  agentModeIcon = computed(() => {
    return this.getAgentModeIcon(this.instance().agentId);
  });

  agentModeName = computed(() => {
    return this.getAgentModeName(this.instance().agentId);
  });

  getProviderDisplayName(provider: string): string {
    switch (provider) {
      case 'claude':
        return 'Claude';
      case 'codex':
        return 'Codex';
      case 'gemini':
        return 'Gemini';
      case 'ollama':
        return 'Ollama';
      case 'copilot':
        return 'Copilot';
      default:
        return 'AI';
    }
  }

  getProviderColor(provider: string): string {
    switch (provider) {
      case 'claude':
        return '#D97706';
      case 'codex':
        return '#10A37F';
      case 'gemini':
        return '#4285F4';
      case 'ollama':
        return '#888888';
      case 'copilot':
        return '#A855F7';
      default:
        return '#888888';
    }
  }

  getAgentModeIcon(agentId?: string): string {
    switch (agentId) {
      case 'plan':
        return '🗺️';
      case 'review':
        return '👁️';
      default:
        return '🔨';
    }
  }

  getAgentModeName(agentId?: string): string {
    switch (agentId) {
      case 'plan':
        return 'Plan';
      case 'review':
        return 'Review';
      default:
        return 'Build';
    }
  }

  onSaveName(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newName = input.value.trim();
    if (newName && newName !== this.instance().displayName) {
      this.saveName.emit(newName);
    }
    this.cancelEditName.emit();
  }
}
