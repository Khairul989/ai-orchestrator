/**
 * Communication IPC Service - Cross-instance communication
 * Note: Backend handlers not yet implemented. Methods fail gracefully.
 */
import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

interface CommApiMethods {
  commSendMessage?: (payload: {
    fromInstanceId: string;
    toInstanceId: string;
    content: string;
    type?: string;
  }) => Promise<IpcResponse>;
  commCreateBridge?: (instanceId1: string, instanceId2: string) => Promise<IpcResponse>;
  commGetMessages?: (instanceId?: string, limit?: number) => Promise<IpcResponse>;
  commGetBridges?: () => Promise<IpcResponse>;
}

@Injectable({ providedIn: 'root' })
export class CommIpcService {
  private base = inject(ElectronIpcService);
  private get api() { return this.base.getApi(); }
  private get commApi(): CommApiMethods | null {
    if (!this.api) return null;
    return this.api as unknown as CommApiMethods;
  }

  async sendMessage(payload: {
    fromInstanceId: string;
    toInstanceId: string;
    content: string;
    type?: string;
  }): Promise<IpcResponse> {
    if (!this.commApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.commApi.commSendMessage?.(payload)
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }

  async createBridge(instanceId1: string, instanceId2: string): Promise<IpcResponse> {
    if (!this.commApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.commApi.commCreateBridge?.(instanceId1, instanceId2)
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }

  async getMessages(instanceId?: string, limit?: number): Promise<IpcResponse> {
    if (!this.commApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.commApi.commGetMessages?.(instanceId, limit)
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }

  async getBridges(): Promise<IpcResponse> {
    if (!this.commApi) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await this.commApi.commGetBridges?.()
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }
}
