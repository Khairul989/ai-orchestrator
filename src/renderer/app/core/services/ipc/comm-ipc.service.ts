/**
 * Communication IPC Service - Cross-instance communication
 * Note: Backend handlers not yet implemented. Methods fail gracefully.
 */
import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class CommIpcService {
  private base = inject(ElectronIpcService);
  private get api() { return this.base.getApi(); }

  async sendMessage(payload: {
    fromInstanceId: string;
    toInstanceId: string;
    content: string;
    type?: string;
  }): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).commSendMessage?.(payload)
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }

  async createBridge(instanceId1: string, instanceId2: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).commCreateBridge?.(instanceId1, instanceId2)
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }

  async getMessages(instanceId?: string, limit?: number): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).commGetMessages?.(instanceId, limit)
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }

  async getBridges(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as any).commGetBridges?.()
        ?? { success: false, error: { message: 'Communication channel not available' } };
    } catch { return { success: false, error: { message: 'Communication service unavailable' } }; }
  }
}
