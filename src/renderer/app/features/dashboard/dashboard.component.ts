/**
 * Dashboard Component - Main application layout
 */

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  HostListener
} from '@angular/core';
import { Router } from '@angular/router';
import { InstanceStore } from '../../core/state/instance.store';
import { CliStore } from '../../core/state/cli.store';
import { SettingsStore } from '../../core/state/settings.store';
import { AgentStore } from '../../core/state/agent.store';
import { KeybindingService } from '../../core/services/keybinding.service';
import { ViewLayoutService } from '../../core/services/view-layout.service';
import { InstanceListComponent } from '../instance-list/instance-list.component';
import { InstanceDetailComponent } from '../instance-detail/instance-detail.component';
import { CliErrorComponent } from '../cli-error/cli-error.component';
import { SettingsComponent } from '../settings/settings.component';
import { HistorySidebarComponent } from '../history/history-sidebar.component';
import { CommandPaletteComponent } from '../commands/command-palette.component';
import { FileExplorerComponent } from '../file-explorer/file-explorer.component';
import { ProviderType } from '../providers/provider-selector.component';
import { CopilotModelSelectorComponent } from '../providers/copilot-model-selector.component';
import { ProviderStateService } from '../../core/services/provider-state.service';
import { SidebarHeaderComponent } from './sidebar-header.component';
import { SidebarNavComponent } from './sidebar-nav.component';
import { SidebarFooterComponent } from './sidebar-footer.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    InstanceListComponent,
    InstanceDetailComponent,
    CliErrorComponent,
    SettingsComponent,
    HistorySidebarComponent,
    CommandPaletteComponent,
    FileExplorerComponent,
    CopilotModelSelectorComponent,
    SidebarHeaderComponent,
    SidebarNavComponent,
    SidebarFooterComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  store = inject(InstanceStore);
  cliStore = inject(CliStore);
  settingsStore = inject(SettingsStore);
  agentStore = inject(AgentStore);
  keybindingService = inject(KeybindingService);
  private viewLayoutService = inject(ViewLayoutService);
  private providerState = inject(ProviderStateService);

  showSettings = signal(false);
  showHistory = signal(false);
  showCommandPalette = signal(false);
  showSidebar = signal(true);
  // Use shared provider state so instance-detail can access it
  selectedProvider = this.providerState.selectedProvider;
  selectedModel = this.providerState.selectedModel;

  // Computed: selected instance's working directory for file explorer
  selectedInstanceWorkingDir = computed(() => {
    const instance = this.store.selectedInstance();
    return instance?.workingDirectory || null;
  });

  // Computed: show Copilot model selector when Copilot is selected and no active instance
  showCopilotModelSelector = computed(() => {
    return this.selectedProvider() === 'copilot' && !this.store.selectedInstance();
  });

  // Sidebar resize state - using ViewLayoutService for persistence
  sidebarWidth = signal(this.viewLayoutService.sidebarWidth);
  isResizing = signal(false);
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  private keybindingCleanup: (() => void)[] = [];

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
    const newWidth = Math.max(
      285,
      Math.min(600, this.resizeStartWidth + delta)
    );
    this.sidebarWidth.set(newWidth);
    // Update service (debounced save)
    this.viewLayoutService.setSidebarWidth(newWidth);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isResizing()) {
      this.isResizing.set(false);
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
          const currentIndex = instances.findIndex((i) => i.id === selected.id);
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
          const currentIndex = instances.findIndex((i) => i.id === selected.id);
          const prevIndex =
            currentIndex === 0 ? instances.length - 1 : currentIndex - 1;
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
        } else {
          // No modals open - interrupt the selected instance if busy
          const instance = this.store.selectedInstance();
          if (instance && instance.status === 'busy') {
            this.store.interruptInstance(instance.id);
          }
        }
      })
    );
  }

  createInstance(): void {
    const settings = this.settingsStore.settings();
    const selectedAgent = this.agentStore.selectedAgent();
    const provider = this.selectedProvider();
    const model = this.selectedModel();
    const workingDirectory = settings.defaultWorkingDirectory || undefined;
    const folderName = workingDirectory?.split(/[/\\]/).filter(Boolean).pop();
    this.store.createInstance({
      displayName: folderName || `${selectedAgent.name} Instance`,
      workingDirectory,
      yoloMode: settings.defaultYoloMode,
      agentId: selectedAgent.id,
      provider: provider === 'auto' ? undefined : provider,
      model: model || undefined
    });
  }

  onProviderSelected(provider: ProviderType): void {
    this.providerState.setProvider(provider);
  }

  onModelSelected(model: string): void {
    this.providerState.setModel(model);
  }

  closeAllInstances(): void {
    this.store.terminateAllInstances();
  }

  navigateToVerification(): void {
    this.router.navigate(['/verification']);
  }

  openRlm(): void {
    this.router.navigate(['/rlm']);
  }

  onRetryCliDetection(): void {
    this.cliStore.refresh();
  }

  onCommandExecuted(event: { commandId: string; args: string[] }): void {
    console.log('Command executed:', event);
    // Command execution is handled by the palette component via CommandStore
    if (event.commandId === 'builtin-rlm') {
      this.openRlm();
    }
  }

  onFileDragged(event: {
    path: string;
    name: string;
    isDirectory: boolean;
  }): void {
    // File dragged from explorer - can be used for drag preview feedback
    console.log('File dragged from explorer:', event);
  }

  ngOnDestroy(): void {
    // Cleanup keybinding handlers
    this.keybindingCleanup.forEach((cleanup) => cleanup());
    this.keybindingCleanup = [];
  }
}
