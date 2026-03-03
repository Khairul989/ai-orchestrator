/**
 * Observation IPC Service - Observation and reflection operations
 *
 * NOTE: These IPC channels may not have backend handlers yet.
 * All methods gracefully handle missing channels and service failures.
 */

import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

interface ObservationApiMethods {
  observationGetObservations?: (options?: { instanceId?: string; limit?: number }) => Promise<IpcResponse>;
  observationGetReflections?: (options?: { instanceId?: string; limit?: number }) => Promise<IpcResponse>;
  observationForceReflect?: (instanceId?: string) => Promise<IpcResponse>;
  observationGetPatterns?: () => Promise<IpcResponse>;
}

@Injectable({ providedIn: 'root' })
export class ObservationIpcService {
  private base = inject(ElectronIpcService);

  private get api() {
    return this.base.getApi();
  }

  private get observationApi(): ObservationApiMethods | null {
    if (!this.api) return null;
    return this.api as unknown as ObservationApiMethods;
  }

  /**
   * Get observations, optionally filtered by instanceId and limited in count
   */
  async getObservations(options?: { instanceId?: string; limit?: number }): Promise<IpcResponse> {
    if (!this.observationApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.observationApi.observationGetObservations?.(options)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }

  /**
   * Get reflections, optionally filtered by instanceId and limited in count
   */
  async getReflections(options?: { instanceId?: string; limit?: number }): Promise<IpcResponse> {
    if (!this.observationApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.observationApi.observationGetReflections?.(options)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }

  /**
   * Trigger a forced reflection cycle for a given instance (or all instances if omitted)
   */
  async forceReflect(instanceId?: string): Promise<IpcResponse> {
    if (!this.observationApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.observationApi.observationForceReflect?.(instanceId)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }

  /**
   * Get recognized behavioral patterns from observed agent actions
   */
  async getPatterns(): Promise<IpcResponse> {
    if (!this.observationApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.observationApi.observationGetPatterns?.()
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Observation service unavailable' } };
    }
  }
}
