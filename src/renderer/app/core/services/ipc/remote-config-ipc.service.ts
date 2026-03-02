/**
 * Remote Config IPC Service - Remote configuration fetching and management
 */
import { Injectable, inject, NgZone } from '@angular/core';
import { ElectronIpcService, IpcResponse } from './electron-ipc.service';

@Injectable({ providedIn: 'root' })
export class RemoteConfigIpcService {
  private base = inject(ElectronIpcService);
  private ngZone = inject(NgZone);

  private get api() {
    return this.base.getApi();
  }

  /**
   * Fetch remote config, optionally bypassing cache
   */
  async remoteConfigFetch(force?: boolean): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.remoteConfigFetch(force);
  }

  /**
   * Get a config value by key. Pass an empty string for key to retrieve the
   * entire config object.
   */
  async remoteConfigGet(key: string, defaultValue?: unknown): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.remoteConfigGet(key, defaultValue);
  }

  /**
   * Configure the remote config source
   */
  async remoteConfigSetSource(source: {
    type: 'url' | 'file' | 'git';
    location: string;
    refreshInterval?: number;
    branch?: string;
  }): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.remoteConfigSetSource(source);
  }

  /**
   * Get the current remote config status (connection, last fetch, source info)
   */
  async remoteConfigStatus(): Promise<IpcResponse> {
    if (!this.api) return { success: false, error: { message: 'Not in Electron' } };
    return this.api.remoteConfigStatus();
  }

  /**
   * Subscribe to remote config update events.
   * Returns an unsubscribe function.
   */
  onRemoteConfigUpdated(callback: (data: unknown) => void): () => void {
    if (!this.api) return () => { /* noop */ };
    return this.api.onRemoteConfigUpdated((data: unknown) => {
      this.ngZone.run(() => callback(data));
    });
  }

  /**
   * Subscribe to remote config error events.
   * Returns an unsubscribe function.
   */
  onRemoteConfigError(callback: (data: unknown) => void): () => void {
    if (!this.api) return () => { /* noop */ };
    return this.api.onRemoteConfigError((data: unknown) => {
      this.ngZone.run(() => callback(data));
    });
  }
}
