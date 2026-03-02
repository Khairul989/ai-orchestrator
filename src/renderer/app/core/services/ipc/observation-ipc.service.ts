/**
 * Observation IPC Service - Observation and reflection operations
 *
 * NOTE: These IPC channels may not have backend handlers yet.
 * All methods gracefully handle missing channels and service failures.
 */

import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class ObservationIpcService {
  private base = inject(ElectronIpcService);

  private get api() {
    return this.base.getApi();
  }

  /**
   * Get observations, optionally filtered by instanceId and limited in count
   */
  async getObservations(options?: { instanceId?: string; limit?: number }): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).observationGetObservations?.(options)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }

  /**
   * Get reflections, optionally filtered by instanceId and limited in count
   */
  async getReflections(options?: { instanceId?: string; limit?: number }): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).observationGetReflections?.(options)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }

  /**
   * Trigger a forced reflection cycle for a given instance (or all instances if omitted)
   */
  async forceReflect(instanceId?: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).observationForceReflect?.(instanceId)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }

  /**
   * Get recognized behavioral patterns from observed agent actions
   */
  async getPatterns(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).observationGetPatterns?.()
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }
}
