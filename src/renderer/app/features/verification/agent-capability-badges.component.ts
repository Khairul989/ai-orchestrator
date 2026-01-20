/**
 * Agent Capability Badges Component
 *
 * Displays capability badges for an agent:
 * - Icon + label chips
 * - Tooltip with descriptions
 * - Compact and expanded modes
 */

import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentCapability, CapabilityInfo } from '../../../../shared/types/verification-ui.types';
import { CAPABILITY_INFO } from '../../../../shared/types/verification-ui.types';

@Component({
  selector: 'app-agent-capability-badges',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="capability-badges" [class.compact]="compact()">
      @for (cap of visibleCapabilities(); track cap.key) {
        <div
          class="badge"
          [class.premium]="cap.isPremium"
          [title]="cap.description"
        >
          <span class="badge-icon">{{ cap.icon }}</span>
          @if (!compact()) {
            <span class="badge-label">{{ cap.label }}</span>
          }
        </div>
      }

      @if (hiddenCount() > 0) {
        <div
          class="badge more"
          [title]="hiddenCapabilitiesLabel()"
        >
          +{{ hiddenCount() }}
        </div>
      }
    </div>
  `,
  styles: [`
    .capability-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .capability-badges.compact {
      gap: 4px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--bg-tertiary, #262626);
      border-radius: 4px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: default;
      transition: background 0.2s;
    }

    .compact .badge {
      padding: 3px 6px;
      font-size: 11px;
    }

    .badge:hover {
      background: var(--bg-secondary, #1a1a1a);
    }

    .badge.premium {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2));
      border: 1px solid rgba(139, 92, 246, 0.3);
    }

    .badge-icon {
      font-size: 12px;
    }

    .compact .badge-icon {
      font-size: 10px;
    }

    .badge-label {
      font-weight: 500;
    }

    .badge.more {
      background: var(--bg-secondary, #1a1a1a);
      color: var(--text-muted, #6b7280);
      font-weight: 600;
    }
  `],
})
export class AgentCapabilityBadgesComponent {
  // Inputs
  capabilities = input.required<string[]>();
  maxVisible = input<number>(5);
  compact = input<boolean>(false);

  // Computed
  capabilityInfoList = computed((): CapabilityInfo[] => {
    return this.capabilities()
      .map(cap => CAPABILITY_INFO[cap as AgentCapability])
      .filter((info): info is CapabilityInfo => info !== undefined);
  });

  visibleCapabilities = computed(() => {
    return this.capabilityInfoList().slice(0, this.maxVisible());
  });

  hiddenCapabilities = computed(() => {
    return this.capabilityInfoList().slice(this.maxVisible());
  });

  hiddenCount = computed(() => {
    return this.hiddenCapabilities().length;
  });

  hiddenCapabilitiesLabel = computed(() => {
    return this.hiddenCapabilities()
      .map(cap => cap.label)
      .join(', ');
  });
}
