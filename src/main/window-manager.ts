/**
 * Window Manager - Creates and manages Electron windows
 */

import { app, BrowserWindow, screen, Menu, Notification, shell } from 'electron';
import * as path from 'path';
import { IPC_CHANNELS } from '../shared/types/ipc.types';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isDev: boolean;

  constructor() {
    this.isDev = process.env['NODE_ENV'] === 'development' || !app.isPackaged;
  }

  async createMainWindow(): Promise<BrowserWindow> {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const isMac = process.platform === 'darwin';

    this.mainWindow = new BrowserWindow({
      width: Math.min(1400, width * 0.9),
      height: Math.min(900, height * 0.9),
      minWidth: 800,
      minHeight: 600,
      title: 'AI Orchestrator',

      // Native appearance - hiddenInset shows traffic lights, hides title
      titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
      titleBarOverlay: !isMac
        ? {
            color: '#1a1a2e',
            symbolColor: '#e4e4e7',
            height: 40
          }
        : undefined,
      trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,

      // Visual
      backgroundColor: '#1a1a2e',
      vibrancy: isMac ? 'under-window' : undefined,
      visualEffectState: isMac ? 'active' : undefined,
      transparent: false,

      // Hide default menu bar on Windows/Linux
      autoHideMenuBar: !isMac,

      // Frame - frameless on all platforms, we handle title bar ourselves
      frame: false,

      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: true // Always enable devtools for debugging
      }
    });

    // Remove menu bar entirely on Windows/Linux for cleaner look
    if (!isMac) {
      this.mainWindow.setMenu(null);
    } else {
      // Create a proper macOS menu
      this.createMacMenu();
    }

    // Load the app
    if (this.isDev) {
      // Development: load from Angular dev server
      // Check both ports in case start:fresh was used
      const port = process.env['PORT'] || '4567';
      await this.mainWindow.loadURL(`http://localhost:${port}`);

      // Don't auto-open DevTools - user can open with Cmd+Option+I if needed
      // this.mainWindow.webContents.openDevTools();
    } else {
      // Production: load built files
      await this.mainWindow.loadFile(
        path.join(__dirname, '../renderer/browser/index.html')
      );
    }

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Prevent navigation to external URLs
    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('http://localhost:') && !url.startsWith('file://')) {
        event.preventDefault();
      }
    });

    // Open external links in default browser
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    return this.mainWindow;
  }

  private createMacMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'File',
        submenu: [
          {
            label: 'New Instance',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.mainWindow?.webContents.send(IPC_CHANNELS.MENU_NEW_INSTANCE);
            }
          },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  isMainWindowFocused(): boolean {
    return this.mainWindow?.isFocused() ?? false;
  }

  notifyUserActionRequest(title: string, body: string): void {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        urgency: 'normal'
      });

      notification.on('click', () => {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.focus();
      });

      notification.show();
    }

    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.mainWindow.isFocused()) return;

    this.mainWindow.flashFrame(true);
    const stopFlash = () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.flashFrame(false);
      }
    };

    this.mainWindow.once('focus', stopFlash);
    setTimeout(stopFlash, 15000);

    if (process.platform === 'darwin' && app.dock) {
      const bounceId = app.dock.bounce('informational');
      this.mainWindow.once('focus', () => app.dock?.cancelBounce(bounceId));
      setTimeout(() => app.dock?.cancelBounce(bounceId), 15000);
    }
  }
}
