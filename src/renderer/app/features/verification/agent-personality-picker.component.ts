/**
 * Agent Personality Picker Component
 *
 * Dropdown/selector for choosing agent personalities:
 * - Personality descriptions
 * - Multi-select support
 * - Visual personality cards
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
import type { PersonalityType } from '../../../../shared/types/verification.types';

interface PersonalityInfo {
  type: PersonalityType;
  name: string;
  icon: string;
  description: string;
  color: string;
}

const PERSONALITIES: PersonalityInfo[] = [
  {
    type: 'methodical-analyst',
    name: 'Methodical Analyst',
    icon: '🔬',
    description: 'Systematic, thorough analysis with attention to detail',
    color: '#3b82f6',
  },
  {
    type: 'creative-solver',
    name: 'Creative Solver',
    icon: '💡',
    description: 'Innovative approaches and out-of-the-box thinking',
    color: '#f59e0b',
  },
  {
    type: 'pragmatic-engineer',
    name: 'Pragmatic Engineer',
    icon: '🛠',
    description: 'Practical, implementation-focused perspective',
    color: '#10b981',
  },
  {
    type: 'security-focused',
    name: 'Security Focused',
    icon: '🛡',
    description: 'Security-first mindset, identifies vulnerabilities',
    color: '#ef4444',
  },
  {
    type: 'user-advocate',
    name: 'User Advocate',
    icon: '👤',
    description: 'User experience and accessibility champion',
    color: '#8b5cf6',
  },
  {
    type: 'devils-advocate',
    name: "Devil's Advocate",
    icon: '😈',
    description: 'Challenges assumptions and finds edge cases',
    color: '#ec4899',
  },
  {
    type: 'domain-expert',
    name: 'Domain Expert',
    icon: '🎓',
    description: 'Deep domain knowledge and best practices',
    color: '#06b6d4',
  },
  {
    type: 'generalist',
    name: 'Generalist',
    icon: '🌐',
    description: 'Balanced, well-rounded perspective',
    color: '#6b7280',
  },
];

@Component({
  selector: 'app-agent-personality-picker',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="personality-picker">
      <!-- Header -->
      <div class="picker-header" (click)="toggleOpen()">
        <span class="header-label">Personalities</span>
        <span class="selected-count">{{ selected().length }} selected</span>
        <span class="header-arrow" [class.open]="isOpen()">▼</span>
      </div>

      <!-- Dropdown Panel -->
      @if (isOpen()) {
        <div class="dropdown-panel">
          <!-- Selected Preview -->
          @if (selected().length > 0) {
            <div class="selected-preview">
              @for (type of selected(); track type) {
                <div
                  class="selected-chip"
                  [style.border-color]="getPersonality(type)?.color"
                  (click)="togglePersonality(type); $event.stopPropagation()"
                >
                  <span class="chip-icon">{{ getPersonality(type)?.icon }}</span>
                  <span class="chip-name">{{ getPersonality(type)?.name }}</span>
                  <span class="chip-remove">×</span>
                </div>
              }
            </div>
          }

          <!-- Personality Grid -->
          <div class="personality-grid">
            @for (personality of personalities; track personality.type) {
              <div
                class="personality-card"
                [class.selected]="isSelected(personality.type)"
                [class.disabled]="!canSelect(personality.type)"
                [style.border-color]="isSelected(personality.type) ? personality.color : 'transparent'"
                (click)="togglePersonality(personality.type)"
              >
                <div class="card-header">
                  <span class="personality-icon" [style.background]="personality.color + '20'">
                    {{ personality.icon }}
                  </span>
                  <span class="personality-name">{{ personality.name }}</span>
                  @if (isSelected(personality.type)) {
                    <span class="check-mark" [style.color]="personality.color">✓</span>
                  }
                </div>
                <p class="personality-description">{{ personality.description }}</p>
              </div>
            }
          </div>

          <!-- Actions -->
          <div class="picker-actions">
            <button class="action-btn" (click)="selectAll()">Select All</button>
            <button class="action-btn" (click)="clearAll()">Clear</button>
            <button class="action-btn primary" (click)="close()">Done</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .personality-picker {
      position: relative;
    }

    /* Header */
    .picker-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border-color, #374151);
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .picker-header:hover {
      border-color: var(--border-hover, #9ca3af);
    }

    .header-label {
      font-size: 13px;
      color: var(--text-primary);
      flex: 1;
    }

    .selected-count {
      font-size: 12px;
      color: var(--text-muted, #6b7280);
      padding: 2px 6px;
      background: var(--bg-tertiary, #262626);
      border-radius: 4px;
    }

    .header-arrow {
      font-size: 10px;
      color: var(--text-muted, #6b7280);
      transition: transform 0.2s;
    }

    .header-arrow.open {
      transform: rotate(180deg);
    }

    /* Dropdown Panel */
    .dropdown-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 4px;
      padding: 12px;
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border-color, #374151);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      z-index: 100;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Selected Preview */
    .selected-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color, #374151);
      margin-bottom: 12px;
    }

    .selected-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--bg-tertiary, #262626);
      border: 1px solid;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .selected-chip:hover {
      background: var(--bg-primary, #0a0a0a);
    }

    .chip-icon {
      font-size: 12px;
    }

    .chip-name {
      color: var(--text-primary);
    }

    .chip-remove {
      color: var(--text-muted, #6b7280);
      margin-left: 2px;
    }

    /* Personality Grid */
    .personality-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .personality-card {
      padding: 10px;
      background: var(--bg-tertiary, #262626);
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .personality-card:hover:not(.disabled) {
      background: var(--bg-primary, #0a0a0a);
    }

    .personality-card.selected {
      background: var(--bg-primary, #0a0a0a);
    }

    .personality-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .personality-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      font-size: 14px;
    }

    .personality-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      flex: 1;
    }

    .check-mark {
      font-weight: bold;
    }

    .personality-description {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      margin: 0;
      line-height: 1.4;
    }

    /* Actions */
    .picker-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color, #374151);
    }

    .action-btn {
      flex: 1;
      padding: 8px 12px;
      background: var(--bg-tertiary, #262626);
      border: none;
      border-radius: 4px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.2s;
    }

    .action-btn:hover {
      background: var(--bg-primary, #0a0a0a);
    }

    .action-btn.primary {
      background: var(--accent-color, #3b82f6);
      color: white;
    }

    .action-btn.primary:hover {
      background: #2563eb;
    }
  `],
})
export class AgentPersonalityPickerComponent {
  // Inputs
  selected = input<PersonalityType[]>([]);
  maxSelections = input<number>(5);
  disabled = input<boolean>(false);

  // Outputs
  selectionChange = output<PersonalityType[]>();

  // Internal state
  isOpen = signal(false);

  // Static data
  personalities = PERSONALITIES;

  // ============================================
  // Methods
  // ============================================

  getPersonality(type: PersonalityType): PersonalityInfo | undefined {
    return PERSONALITIES.find(p => p.type === type);
  }

  isSelected(type: PersonalityType): boolean {
    return this.selected().includes(type);
  }

  canSelect(type: PersonalityType): boolean {
    if (this.disabled()) return false;
    if (this.isSelected(type)) return true;
    return this.selected().length < this.maxSelections();
  }

  togglePersonality(type: PersonalityType): void {
    if (this.disabled()) return;

    const current = this.selected();
    let newSelection: PersonalityType[];

    if (this.isSelected(type)) {
      newSelection = current.filter(p => p !== type);
    } else if (this.canSelect(type)) {
      newSelection = [...current, type];
    } else {
      return;
    }

    this.selectionChange.emit(newSelection);
  }

  selectAll(): void {
    if (this.disabled()) return;
    const all = PERSONALITIES.slice(0, this.maxSelections()).map(p => p.type);
    this.selectionChange.emit(all);
  }

  clearAll(): void {
    if (this.disabled()) return;
    this.selectionChange.emit([]);
  }

  toggleOpen(): void {
    if (!this.disabled()) {
      this.isOpen.update(v => !v);
    }
  }

  close(): void {
    this.isOpen.set(false);
  }
}
