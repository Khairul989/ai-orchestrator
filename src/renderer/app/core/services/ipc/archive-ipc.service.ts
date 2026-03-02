/**
 * Archive IPC Service - Session archive operations
 */
import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class ArchiveIpcService {
  private base = inject(ElectronIpcService);

  private get api() {
    return this.base.getApi();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isIpcResponse(value: unknown): value is IpcResponse {
    return this.isRecord(value) && typeof value['success'] === 'boolean';
  }

  private toIpcResponse<T>(value: unknown): IpcResponse<T> {
    if (this.isIpcResponse(value)) {
      return value as IpcResponse<T>;
    }
    return { success: true, data: value as T };
  }

  private async invokeChannel<T = unknown>(
    channel: string,
    payload?: unknown
  ): Promise<IpcResponse<T>> {
    if (!this.api) {
      return { success: false, error: { message: 'Not in Electron' } };
    }

    try {
      const raw = await this.base.invoke<T>(channel, payload);
      return this.toIpcResponse<T>(raw);
    } catch (error) {
      return { success: false, error: { message: (error as Error).message } };
    }
  }

  // ============================================
  // Archive Operations
  // ============================================

  /**
   * Archive a session with optional tags and notes
   */
  async archiveSession(payload: {
    sessionId: string;
    tags?: string[];
    notes?: string;
  }): Promise<IpcResponse> {
    return this.invokeChannel('archive:session', payload);
  }

  /**
   * List archives with optional filters
   */
  async archiveList(filter?: {
    tags?: string[];
    startDate?: number;
    endDate?: number;
    search?: string;
  }): Promise<IpcResponse> {
    return this.invokeChannel('archive:list', { filter });
  }

  /**
   * Restore a session from an archive
   */
  async archiveRestore(archiveId: string): Promise<IpcResponse> {
    return this.invokeChannel('archive:restore', { archiveId });
  }

  /**
   * Delete an archive entry
   */
  async archiveDelete(archiveId: string): Promise<IpcResponse> {
    return this.invokeChannel('archive:delete', { archiveId });
  }

  /**
   * Search archives by query string
   */
  async archiveSearch(
    query: string,
    options?: {
      tags?: string[];
      limit?: number;
    }
  ): Promise<IpcResponse> {
    return this.invokeChannel('archive:search', { query, options });
  }
}
