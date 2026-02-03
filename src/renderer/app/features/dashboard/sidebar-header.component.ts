/**
 * Sidebar Header Component
 * Header section of the dashboard sidebar with title and action buttons
 */

import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { AgentSelectorComponent } from '../agents/agent-selector.component';
import {
  ProviderSelectorComponent,
  ProviderType
} from '../providers/provider-selector.component';

@Component({
  selector: 'app-sidebar-header',
  standalone: true,
  imports: [ProviderSelectorComponent, AgentSelectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sidebar-header">
      <div class="header-row">
        <h1 class="app-title">AI Orchestrator</h1>
        <div class="header-actions">
          <button
            class="btn-header-icon"
            (click)="verificationClicked.emit()"
            title="Multi-Agent Verification"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
              ></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </button>
          <button
            class="btn-header-icon"
            (click)="rlmClicked.emit()"
            title="RLM Context Manager"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 3l9 4.5v9L12 21 3 16.5v-9L12 3z"></path>
              <path d="M12 12l9-4.5"></path>
              <path d="M12 12L3 7.5"></path>
              <path d="M12 12v9"></path>
            </svg>
          </button>
          <button
            class="btn-header-icon"
            (click)="historyClicked.emit()"
            title="History"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
          <button
            class="btn-header-icon"
            (click)="settingsClicked.emit()"
            title="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              ></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="create-section">
        <app-provider-selector
          (providerSelected)="providerSelected.emit($event)"
        />
        <app-agent-selector />
        <button
          class="btn-create"
          (click)="createClicked.emit()"
          title="Create a new instance"
        >
          <span class="btn-icon new-instance">+</span>
          New Instance
        </button>
      </div>
    </div>
  `,
  styleUrl: './sidebar-header.component.scss'
})
export class SidebarHeaderComponent {
  // Output events
  verificationClicked = output<void>();
  rlmClicked = output<void>();
  historyClicked = output<void>();
  settingsClicked = output<void>();
  createClicked = output<void>();
  providerSelected = output<ProviderType>();
}
