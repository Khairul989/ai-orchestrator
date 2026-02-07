/**
 * App-related IPC Handlers
 * Handles app readiness, version info, dialogs, and file system operations
 */

import { ipcMain, IpcMainInvokeEvent, dialog, shell } from 'electron';
import { IPC_CHANNELS, IpcResponse } from '../../../shared/types/ipc.types';
import { WindowManager } from '../../window-manager';
import * as fs from 'fs';
import * as path from 'path';

interface AppHandlerDependencies {
  windowManager: WindowManager;
  getIpcAuthToken: () => string;
}

export function registerAppHandlers(deps: AppHandlerDependencies): void {
  const { windowManager, getIpcAuthToken } = deps;

  // App ready signal
  ipcMain.handle(IPC_CHANNELS.APP_READY, async (): Promise<IpcResponse> => {
    return {
      success: true,
      data: {
        version: '0.1.0',
        platform: process.platform,
        ipcAuthToken: getIpcAuthToken()
      }
    };
  });

  // Get app version
  ipcMain.handle(
    IPC_CHANNELS.APP_GET_VERSION,
    async (): Promise<IpcResponse> => {
      return {
        success: true,
        data: '0.1.0'
      };
    }
  );

  // Open a documentation file
  ipcMain.handle(
    IPC_CHANNELS.APP_OPEN_DOCS,
    async (
      _event: IpcMainInvokeEvent,
      payload: { filename: string }
    ): Promise<IpcResponse> => {
      try {
        const path = await import('path');
        const { app } = await import('electron');
        const fs = await import('fs');

        // Try multiple possible locations for docs
        const possiblePaths = [
          // Development: relative to project root
          path.join(process.cwd(), 'docs', payload.filename),
          // Packaged app: in resources
          path.join(app.getAppPath(), 'docs', payload.filename),
          // Alternative packaged location
          path.join(__dirname, '../../docs', payload.filename)
        ];

        // Find first existing path
        let docsPath: string | null = null;
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            docsPath = p;
            break;
          }
        }

        if (!docsPath) {
          return {
            success: false,
            error: {
              code: 'FILE_NOT_FOUND',
              message: `Documentation file not found: ${payload.filename}`,
              timestamp: Date.now()
            }
          };
        }

        const result = await shell.openPath(docsPath);
        if (result) {
          return {
            success: false,
            error: {
              code: 'FILE_OPEN_FAILED',
              message: result,
              timestamp: Date.now()
            }
          };
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_OPEN_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Note: CLI detection handlers (cli:detect-all, cli:detect-one, cli:test-connection)
  // are registered in cli-verification-ipc-handler.ts with more complete implementation

  // Open folder selection dialog
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_FOLDER,
    async (): Promise<IpcResponse> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Working Folder',
          buttonLabel: 'Select Folder'
        });

        if (result.canceled || result.filePaths.length === 0) {
          return {
            success: true,
            data: null // User cancelled
          };
        }

        return {
          success: true,
          data: result.filePaths[0]
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'DIALOG_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Open file selection dialog
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_FILES,
    async (
      _event,
      options?: {
        multiple?: boolean;
        filters?: { name: string; extensions: string[] }[];
      }
    ): Promise<IpcResponse> => {
      try {
        const properties: ('openFile' | 'multiSelections')[] = ['openFile'];
        if (options?.multiple) {
          properties.push('multiSelections');
        }

        const result = await dialog.showOpenDialog({
          properties,
          title: options?.multiple ? 'Select Files' : 'Select File',
          buttonLabel: 'Select',
          filters: options?.filters || [
            { name: 'All Files', extensions: ['*'] },
            {
              name: 'Images',
              extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
            },
            {
              name: 'Documents',
              extensions: ['pdf', 'txt', 'md', 'json', 'csv']
            },
            {
              name: 'Code',
              extensions: [
                'ts',
                'js',
                'py',
                'go',
                'rs',
                'java',
                'cpp',
                'c',
                'h'
              ]
            }
          ]
        });

        if (result.canceled || result.filePaths.length === 0) {
          return {
            success: true,
            data: null // User cancelled
          };
        }

        return {
          success: true,
          data: result.filePaths
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'DIALOG_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Read directory contents
  ipcMain.handle(
    IPC_CHANNELS.FILE_READ_DIR,
    async (
      _event: IpcMainInvokeEvent,
      payload: { path: string; includeHidden?: boolean }
    ): Promise<IpcResponse> => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const entries = await fs.readdir(payload.path, {
          withFileTypes: true
        });
        const results = await Promise.all(
          entries
            .filter((entry) => {
              // Filter hidden files unless explicitly included
              if (!payload.includeHidden && entry.name.startsWith('.')) {
                return false;
              }
              return true;
            })
            .map(async (entry) => {
              const fullPath = path.join(payload.path, entry.name);
              let stats;
              try {
                stats = await fs.stat(fullPath);
              } catch {
                // Skip files we can't stat
                return null;
              }

              return {
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                isSymlink: entry.isSymbolicLink(),
                size: stats.size,
                modifiedAt: stats.mtimeMs,
                extension: entry.isFile()
                  ? path.extname(entry.name).slice(1)
                  : undefined
              };
            })
        );

        // Filter out nulls and sort: directories first, then alphabetically
        const filtered = results.filter((r) => r !== null);
        filtered.sort((a, b) => {
          if (a!.isDirectory && !b!.isDirectory) return -1;
          if (!a!.isDirectory && b!.isDirectory) return 1;
          return a!.name.localeCompare(b!.name);
        });

        return {
          success: true,
          data: filtered
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_READ_DIR_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get file stats
  ipcMain.handle(
    IPC_CHANNELS.FILE_GET_STATS,
    async (
      _event: IpcMainInvokeEvent,
      payload: { path: string }
    ): Promise<IpcResponse> => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const stats = await fs.stat(payload.path);

        return {
          success: true,
          data: {
            name: path.basename(payload.path),
            path: payload.path,
            isDirectory: stats.isDirectory(),
            isSymlink: stats.isSymbolicLink(),
            size: stats.size,
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs,
            extension: stats.isFile()
              ? path.extname(payload.path).slice(1)
              : undefined
          }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_GET_STATS_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Read file content as text (bounded)
  ipcMain.handle(
    IPC_CHANNELS.FILE_READ_TEXT,
    async (
      _event: IpcMainInvokeEvent,
      payload: { path: string; maxBytes?: number }
    ): Promise<IpcResponse> => {
      try {
        const fs = await import('fs/promises');

        const maxBytes = Math.max(
          1,
          Math.min(payload.maxBytes ?? 512 * 1024, 5 * 1024 * 1024)
        );
        const buf = await fs.readFile(payload.path);
        const truncated = buf.byteLength > maxBytes;
        const contentBuf = truncated ? buf.subarray(0, maxBytes) : buf;

        return {
          success: true,
          data: {
            path: payload.path,
            content: contentBuf.toString('utf-8'),
            truncated,
            size: buf.byteLength
          }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_READ_TEXT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Write file content as text
  ipcMain.handle(
    IPC_CHANNELS.FILE_WRITE_TEXT,
    async (
      _event: IpcMainInvokeEvent,
      payload: { path: string; content: string; createDirs?: boolean }
    ): Promise<IpcResponse> => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        if (payload.createDirs) {
          await fs.mkdir(path.dirname(payload.path), { recursive: true });
        }

        await fs.writeFile(payload.path, payload.content ?? '', 'utf-8');
        const bytesWritten = Buffer.byteLength(payload.content ?? '', 'utf-8');
        return {
          success: true,
          data: { path: payload.path, bytesWritten }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_WRITE_TEXT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Open file or folder with system default application
  ipcMain.handle(
    IPC_CHANNELS.FILE_OPEN_PATH,
    async (
      _event: IpcMainInvokeEvent,
      payload: { path: string }
    ): Promise<IpcResponse> => {
      try {
        const result = await shell.openPath(payload.path);
        // shell.openPath returns empty string on success, error message on failure
        if (result) {
          return {
            success: false,
            error: {
              code: 'FILE_OPEN_FAILED',
              message: result,
              timestamp: Date.now()
            }
          };
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_OPEN_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );
}
