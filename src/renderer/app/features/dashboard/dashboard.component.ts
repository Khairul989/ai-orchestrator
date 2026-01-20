/**
 * Dashboard Component - Main application layout
 */

import { Component, inject, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { InstanceStore } from '../../core/state/instance.store';
import { CliStore } from '../../core/state/cli.store';
import { SettingsStore } from '../../core/state/settings.store';
import { AgentStore } from '../../core/state/agent.store';
import { KeybindingService } from '../../core/services/keybinding.service';
import { InstanceListComponent } from '../instance-list/instance-list.component';
import { InstanceDetailComponent } from '../instance-detail/instance-detail.component';
import { CliErrorComponent } from '../cli-error/cli-error.component';
import { SettingsComponent } from '../settings/settings.component';
import { HistorySidebarComponent } from '../history/history-sidebar.component';
import { AgentSelectorComponent } from '../agents/agent-selector.component';
import { CommandPaletteComponent } from '../commands/command-palette.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, InstanceListComponent, InstanceDetailComponent, CliErrorComponent, SettingsComponent, HistorySidebarComponent, AgentSelectorComponent, CommandPaletteComponent],
  template: `
    @if (cliStore.loading()) {
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Detecting available AI CLIs...</p>
      </div>
    } @else if (cliStore.noClisError()) {
      <app-cli-error [error]="cliStore.noClisError()!" (retry)="onRetryCliDetection()" />
    } @else {
    <div class="dashboard" [class.sidebar-hidden]="!showSidebar()" [class.resizing]="isResizing()">
      <!-- Sidebar with instance list -->
      @if (showSidebar()) {
      <aside class="sidebar" [style.width.px]="sidebarWidth()">
        <div class="sidebar-header">
          <div class="header-row">
            <h1 class="app-title">Claude Orchestrator</h1>
            <div class="header-actions">
              <button class="btn-header-icon" (click)="navigateToVerification()" title="Multi-Agent Verification">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </button>
              <button class="btn-header-icon" (click)="showHistory.set(true)" title="History">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>
              <button class="btn-header-icon" (click)="showSettings.set(true)" title="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="create-section">
            <app-agent-selector />
            <button class="btn-create" (click)="createInstance()">
              <span class="btn-icon">+</span>
              New Instance
            </button>
          </div>
        </div>

        <app-instance-list />

        <div class="sidebar-footer">
          <div class="stats">
            <span class="stat">
              {{ store.instanceCount() }} instances
            </span>
            @if (store.totalContextUsage().total > 0) {
              <span class="stat">
                {{ (store.totalContextUsage().percentage | number:'1.0-0') }}% context
              </span>
            }
            @if (store.totalContextUsage().costEstimate) {
              <span class="stat cost-stat">
                ~\${{ store.totalContextUsage().costEstimate | number:'1.2-2' }}
              </span>
            }
          </div>
          @if (store.instanceCount() > 0) {
            <button
              class="btn-close-all"
              (click)="closeAllInstances()"
              title="Close all instances"
            >
              Close All
            </button>
          }
        </div>
      </aside>

      <!-- Resize handle -->
      <div
        class="resize-handle"
        (mousedown)="onResizeStart($event)"
        [class.dragging]="isResizing()"
      ></div>
      }

      <!-- Main content area -->
      <main class="main-content">
        <app-instance-detail />
      </main>
    </div>

    <!-- Settings Modal -->
    @if (showSettings()) {
      <app-settings (close)="showSettings.set(false)" />
    }

    <!-- History Sidebar -->
    @if (showHistory()) {
      <app-history-sidebar (close)="showHistory.set(false)" />
    }

    <!-- Command Palette -->
    @if (showCommandPalette()) {
      <app-command-palette
        (close)="showCommandPalette.set(false)"
        (commandExecuted)="onCommandExecuted($event)"
      />
    }
    }
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: var(--spacing-md);
      color: var(--text-secondary);
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-color);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .dashboard {
      display: flex;
      min-height: 100%;
      height: calc(100vh - 52px); /* Account for macOS title bar */
      width: 100%;
      background: var(--bg-primary);
    }

    .dashboard.resizing {
      user-select: none;
      cursor: col-resize;
    }

    .sidebar {
      min-width: 285px;
      max-width: 600px;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .resize-handle {
      width: 4px;
      height: 100%;
      background: transparent;
      cursor: col-resize;
      flex-shrink: 0;
      position: relative;
      z-index: 10;
      transition: background var(--transition-fast);

      &:hover,
      &.dragging {
        background: var(--primary-color);
      }
    }

    .resize-handle::before {
      content: '';
      position: absolute;
      left: -4px;
      right: -4px;
      top: 0;
      bottom: 0;
    }

    .sidebar-header {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--border-color);
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-md);
    }

    .app-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .btn-header-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
      -webkit-app-region: no-drag;

      &:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
    }

    .create-section {
      display: flex;
      gap: var(--spacing-sm);
      align-items: stretch;
    }

    .btn-create {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--primary-color);
      color: white;
      border-radius: var(--radius-md);
      font-weight: 500;
      transition: background var(--transition-fast);
      -webkit-app-region: no-drag; /* Ensure button is clickable in drag zone */

      &:hover {
        background: var(--primary-hover);
      }
    }

    .btn-icon {
      font-size: 18px;
      line-height: 1;
    }

    .sidebar-footer {
      padding: var(--spacing-md);
      border-top: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .stats {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .cost-stat {
      color: var(--warning-color);
      font-weight: 500;
    }

    .btn-close-all {
      width: 100%;
      padding: var(--spacing-xs) var(--spacing-sm);
      background: transparent;
      border: 1px solid var(--error-color);
      color: var(--error-color);
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition-fast);

      &:hover {
        background: var(--error-color);
        color: white;
      }
    }

    .main-content {
      flex: 1;
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: flex;
      overflow: hidden;
      background: var(--bg-primary);
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  store = inject(InstanceStore);
  cliStore = inject(CliStore);
  settingsStore = inject(SettingsStore);
  agentStore = inject(AgentStore);
  keybindingService = inject(KeybindingService);

  showSettings = signal(false);
  showHistory = signal(false);
  showCommandPalette = signal(false);
  showSidebar = signal(true);

  // Sidebar resize state
  sidebarWidth = signal(this.loadSidebarWidth());
  isResizing = signal(false);
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  private keybindingCleanup: (() => void)[] = [];

  private loadSidebarWidth(): number {
    const saved = localStorage.getItem('sidebarWidth');
    const width = saved ? parseInt(saved, 10) : 320;
    return Math.max(285, Math.min(600, width)); // Clamp to valid range
  }

  private saveSidebarWidth(width: number): void {
    localStorage.setItem('sidebarWidth', width.toString());
  }

  onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing.set(true);
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.sidebarWidth();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizing()) return;

    const delta = event.clientX - this.resizeStartX;
    const newWidth = Math.max(285, Math.min(600, this.resizeStartWidth + delta));
    this.sidebarWidth.set(newWidth);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isResizing()) {
      this.isResizing.set(false);
      this.saveSidebarWidth(this.sidebarWidth());
    }
  }

  ngOnInit(): void {
    // Initialize settings first, then CLI detection
    this.settingsStore.initialize().then(() => {
      this.cliStore.initialize();
    });

    // Register keybinding handlers
    this.registerKeybindingHandlers();
  }

  /**
   * Register all keybinding handlers
   */
  private registerKeybindingHandlers(): void {
    // Command palette - Cmd+Shift+P or Cmd+K
    this.keybindingCleanup.push(
      this.keybindingService.onAction('toggle-command-palette', () => {
        if (this.store.selectedInstance()) {
          this.showCommandPalette.set(!this.showCommandPalette());
        }
      })
    );

    // Settings - Cmd+,
    this.keybindingCleanup.push(
      this.keybindingService.onAction('toggle-settings', () => {
        this.showSettings.set(!this.showSettings());
      })
    );

    // History - Cmd+H
    this.keybindingCleanup.push(
      this.keybindingService.onAction('toggle-history', () => {
        this.showHistory.set(!this.showHistory());
      })
    );

    // Sidebar toggle - Cmd+B
    this.keybindingCleanup.push(
      this.keybindingService.onAction('toggle-sidebar', () => {
        this.showSidebar.set(!this.showSidebar());
      })
    );

    // New instance - Cmd+N
    this.keybindingCleanup.push(
      this.keybindingService.onAction('new-instance', () => {
        this.createInstance();
      })
    );

    // Close instance - Cmd+W
    this.keybindingCleanup.push(
      this.keybindingService.onAction('close-instance', () => {
        const instance = this.store.selectedInstance();
        if (instance) {
          this.store.terminateInstance(instance.id);
        }
      })
    );

    // Next instance - Ctrl+Tab
    this.keybindingCleanup.push(
      this.keybindingService.onAction('next-instance', () => {
        const instances = this.store.instances();
        const selected = this.store.selectedInstance();
        if (instances.length > 1 && selected) {
          const currentIndex = instances.findIndex(i => i.id === selected.id);
          const nextIndex = (currentIndex + 1) % instances.length;
          this.store.setSelectedInstance(instances[nextIndex].id);
        }
      })
    );

    // Previous instance - Ctrl+Shift+Tab
    this.keybindingCleanup.push(
      this.keybindingService.onAction('prev-instance', () => {
        const instances = this.store.instances();
        const selected = this.store.selectedInstance();
        if (instances.length > 1 && selected) {
          const currentIndex = instances.findIndex(i => i.id === selected.id);
          const prevIndex = currentIndex === 0 ? instances.length - 1 : currentIndex - 1;
          this.store.setSelectedInstance(instances[prevIndex].id);
        }
      })
    );

    // Restart instance - Cmd+Shift+R
    this.keybindingCleanup.push(
      this.keybindingService.onAction('restart-instance', () => {
        const instance = this.store.selectedInstance();
        if (instance) {
          this.store.restartInstance(instance.id);
        }
      })
    );

    // Cancel operation - Escape
    this.keybindingCleanup.push(
      this.keybindingService.onAction('cancel-operation', () => {
        // Close any open modals first
        if (this.showCommandPalette()) {
          this.showCommandPalette.set(false);
        } else if (this.showSettings()) {
          this.showSettings.set(false);
        } else if (this.showHistory()) {
          this.showHistory.set(false);
        }
      })
    );
  }

  createInstance(): void {
    const settings = this.settingsStore.settings();
    const selectedAgent = this.agentStore.selectedAgent();
    this.store.createInstance({
      displayName: `${selectedAgent.name} Instance`,
      workingDirectory: settings.defaultWorkingDirectory || undefined,
      yoloMode: settings.defaultYoloMode,
      agentId: selectedAgent.id,
    });
  }

  closeAllInstances(): void {
    this.store.terminateAllInstances();
  }

  navigateToVerification(): void {
    this.router.navigate(['/verification']);
  }

  onRetryCliDetection(): void {
    this.cliStore.refresh();
  }

  onCommandExecuted(event: { commandId: string; args: string[] }): void {
    console.log('Command executed:', event);
    // Command execution is handled by the palette component via CommandStore
  }

  ngOnDestroy(): void {
    // Cleanup keybinding handlers
    this.keybindingCleanup.forEach(cleanup => cleanup());
    this.keybindingCleanup = [];
  }
}
