/**
 * Observation IPC Service - Observation and reflection operations
 */
import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class ObservationIpcService {
  private base = inject(ElectronIpcService);
  private get api() { return this.base.getApi(); }

  async getObservations(options?: { limit?: number }): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationGetObservations(options);
  }

  async getReflections(options?: { limit?: number }): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationGetReflections(options);
  }

  async getPatterns(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationGetStats();
  }

  async getStats(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationGetStats();
  }

  async configure(config: Record<string, unknown>): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationConfigure(config);
  }

  async getConfig(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationGetConfig();
  }

  async forceReflect(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationForceReflect();
  }

  async cleanup(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.observationCleanup();
  }
}
