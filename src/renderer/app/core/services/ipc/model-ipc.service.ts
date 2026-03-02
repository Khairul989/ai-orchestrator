/**
 * Model IPC Service - Model discovery and management
 *
 * Wraps the available provider model listing channels exposed by the preload
 * script (listCopilotModels, listModelsForProvider) and provides graceful
 * fallbacks for model management channels that require backend handler
 * registration (discoverModels, verifyModel, setOverride).
 */

import { Injectable, inject } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class ModelIpcService {
  private base = inject(ElectronIpcService);

  private get api() {
    return this.base.getApi();
  }

  /**
   * List available models for a given provider.
   * Delegates to the preload's listModelsForProvider channel.
   */
  async listProviderModels(provider: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.listModelsForProvider(provider);
  }

  /**
   * List available models from the Copilot CLI.
   * Delegates to the preload's listCopilotModels channel.
   */
  async listCopilotModels(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.listCopilotModels();
  }

  /**
   * Discover all available models across providers.
   * Requires backend handler registration for the model:discover channel.
   */
  async discoverModels(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as unknown as Record<string, (...args: unknown[]) => Promise<IpcResponse>>)['modelDiscover']?.()
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Model discovery unavailable' } };
    }
  }

  /**
   * Verify a specific model is accessible and usable.
   * Requires backend handler registration for the model:verify channel.
   */
  async verifyModel(modelId: string): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as unknown as Record<string, (...args: unknown[]) => Promise<IpcResponse>>)['modelVerify']?.(modelId)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Model verification unavailable' } };
    }
  }

  /**
   * Set a model override configuration.
   * Requires backend handler registration for the model:set-override channel.
   */
  async setOverride(modelId: string, config: Record<string, unknown>): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    try {
      return await (this.api as unknown as Record<string, (...args: unknown[]) => Promise<IpcResponse>>)['modelSetOverride']?.(modelId, config)
        ?? { success: false, error: { message: 'Channel not available' } };
    } catch {
      return { success: false, error: { message: 'Override unavailable' } };
    }
  }
}
