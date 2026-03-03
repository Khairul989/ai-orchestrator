/**
 * Model IPC Service - Model discovery and management
 */
import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class ModelIpcService {
  private base = inject(ElectronIpcService);
  private get api() { return this.base.getApi(); }

  async listProviderModels(provider: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.listModelsForProvider(provider);
  }

  async listCopilotModels(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.listCopilotModels();
  }

  async discoverModels(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.modelDiscover();
  }

  async verifyModel(modelId: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.modelVerify({ modelId });
  }

  async setOverride(modelId: string, config: Record<string, unknown>): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.modelSetOverride({ modelId, config });
  }

  async removeOverride(modelId: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.modelRemoveOverride({ modelId });
  }
}
