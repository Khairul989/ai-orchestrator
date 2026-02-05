/**
 * Instance List Store - Manages instance CRUD operations
 *
 * Handles: add, remove, create, terminate, restart, rename instances.
 * Also includes file handling helpers for attachments.
 */

import { Injectable, inject } from '@angular/core';
import { ElectronIpcService } from '../../services/ipc';
import { InstanceStateService } from './instance-state.service';
import type {
  Instance,
  InstanceStatus,
  OutputMessage,
  CreateInstanceConfig,
} from './instance.types';

@Injectable({ providedIn: 'root' })
export class InstanceListStore {
  private stateService = inject(InstanceStateService);
  private ipc = inject(ElectronIpcService);

  // File size limits (Anthropic API limits)
  private static readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024;     // 5MB for images
  private static readonly MAX_FILE_SIZE = 30 * 1024 * 1024;      // 30MB for other files
  private static readonly MAX_IMAGE_DIMENSION = 8000;            // Maximum dimension

  // ============================================
  // Instance CRUD Operations
  // ============================================

  /**
   * Add an instance to the store (called from IPC listener)
   */
  addInstance(data: unknown): void {
    const instance = this.deserializeInstance(data);

    // Only auto-select if it's a root instance (not a child)
    const shouldAutoSelect = !instance.parentId;

    this.stateService.addInstance(instance, shouldAutoSelect);
  }

  /**
   * Remove an instance from the store (called from IPC listener)
   */
  removeInstance(instanceId: string): void {
    this.stateService.removeInstance(instanceId);
  }

  /**
   * Load initial instances from the backend
   */
  async loadInitialInstances(): Promise<void> {
    this.stateService.setLoading(true);

    try {
      const response = (await this.ipc.listInstances()) as {
        success: boolean;
        data?: unknown[];
      };
      if (response.success && response.data && Array.isArray(response.data)) {
        const instances = new Map<string, Instance>();
        for (const data of response.data) {
          const item = data as Record<string, unknown>;
          instances.set(item['id'] as string, this.deserializeInstance(item));
        }
        this.stateService.setInstances(instances);
      }
    } catch (err) {
      console.error('Failed to load instances:', err);
      this.stateService.setLoading(false);
      this.stateService.setError('Failed to load instances');
    }
  }

  /**
   * Create a new instance
   */
  async createInstance(config: CreateInstanceConfig): Promise<void> {
    console.log('InstanceListStore: createInstance called with:', config);
    this.stateService.setLoading(true);

    try {
      const result = await this.ipc.createInstance({
        workingDirectory: config.workingDirectory || '.',
        displayName: config.displayName,
        parentInstanceId: config.parentId,
        yoloMode: config.yoloMode,
        agentId: config.agentId,
        provider: config.provider,
        model: config.model,
      });
      console.log('InstanceListStore: createInstance result:', result);
      this.stateService.setLoading(false);
    } catch (error) {
      console.error('InstanceListStore: createInstance error:', error);
      this.stateService.setLoading(false);
      this.stateService.setError('Failed to create instance');
    }
  }

  /**
   * Create instance and immediately send a message
   */
  async createInstanceWithMessage(
    message: string,
    files?: File[],
    workingDirectory?: string,
    provider?: 'claude' | 'openai' | 'gemini' | 'copilot' | 'auto',
    model?: string
  ): Promise<void> {
    console.log('InstanceListStore: createInstanceWithMessage called with:', {
      message,
      filesCount: files?.length,
      workingDirectory,
      provider,
      model,
    });

    // Validate files first
    if (files && files.length > 0) {
      const validationErrors = this.validateFiles(files);
      if (validationErrors.length > 0) {
        const errorMessage = validationErrors.join('\n');
        console.error('InstanceListStore: File validation failed:', errorMessage);
        this.stateService.setError(`Cannot create instance:\n${errorMessage}`);
        return;
      }
    }

    this.stateService.setLoading(true);

    try {
      // Convert files to base64 for IPC
      const attachments =
        files && files.length > 0
          ? await Promise.all(files.map((f) => this.fileToAttachment(f)))
          : undefined;

      const result = await this.ipc.createInstanceWithMessage({
        workingDirectory: workingDirectory || '.',
        message,
        attachments,
        provider: provider === 'auto' ? undefined : provider,
        model,
      });
      console.log('InstanceListStore: createInstanceWithMessage result:', result);
      this.stateService.setLoading(false);
    } catch (error) {
      console.error('InstanceListStore: createInstanceWithMessage error:', error);
      this.stateService.setLoading(false);
      this.stateService.setError(`Failed to create instance: ${(error as Error).message}`);
    }
  }

  /**
   * Create a child instance
   */
  async createChildInstance(parentId: string): Promise<void> {
    const parent = this.stateService.getInstance(parentId);
    if (!parent) return;

    await this.createInstance({
      workingDirectory: parent.workingDirectory,
      displayName: `${parent.displayName} > Child`,
      parentId,
    });
  }

  /**
   * Terminate an instance
   */
  async terminateInstance(instanceId: string): Promise<void> {
    await this.ipc.terminateInstance(instanceId);
  }

  /**
   * Interrupt an instance (Ctrl+C equivalent)
   */
  async interruptInstance(instanceId: string): Promise<void> {
    const result = await this.ipc.interruptInstance(instanceId);
    if (result.success) {
      // Optimistically update status to waiting_for_input
      this.stateService.updateInstance(instanceId, {
        status: 'waiting_for_input' as InstanceStatus,
      });
    }
  }

  /**
   * Restart an instance
   */
  async restartInstance(instanceId: string): Promise<void> {
    const result = await this.ipc.restartInstance(instanceId);
    if (result.success) {
      // Clear the output buffer and reset status
      this.stateService.updateInstance(instanceId, {
        outputBuffer: [],
        status: 'idle' as InstanceStatus,
      });
    }
  }

  /**
   * Rename an instance
   */
  async renameInstance(instanceId: string, displayName: string): Promise<void> {
    // Optimistic update
    this.stateService.updateInstance(instanceId, { displayName });
    await this.ipc.renameInstance(instanceId, displayName);
  }

  /**
   * Terminate all instances
   */
  async terminateAllInstances(): Promise<void> {
    await this.ipc.terminateAllInstances();
  }

  /**
   * Toggle YOLO mode for an instance
   */
  async toggleYoloMode(instanceId: string): Promise<void> {
    const instance = this.stateService.getInstance(instanceId);
    if (!instance) return;

    console.log('[InstanceListStore] toggleYoloMode called for:', instanceId);

    const response = await this.ipc.toggleYoloMode(instanceId);
    console.log('[InstanceListStore] toggleYoloMode response:', response);

    if (response.success && 'data' in response) {
      const data = response.data as { yoloMode?: boolean; status?: string } | undefined;
      const newYoloMode = data?.yoloMode ?? !instance.yoloMode;
      console.log('[InstanceListStore] Updating yoloMode to', newYoloMode);

      this.stateService.updateInstance(instanceId, {
        yoloMode: newYoloMode,
        status: (data?.status as InstanceStatus) || 'idle',
      });
    } else if ('error' in response) {
      console.error('Failed to toggle YOLO mode:', response.error);
    }
  }

  /**
   * Change agent mode for an instance
   */
  async changeAgentMode(instanceId: string, newAgentId: string): Promise<void> {
    const instance = this.stateService.getInstance(instanceId);
    if (!instance || instance.agentId === newAgentId) return;

    const response = await this.ipc.changeAgentMode(instanceId, newAgentId);

    if (response.success && 'data' in response && response.data) {
      const data = response.data as { agentMode?: string; status?: string };
      this.stateService.updateInstance(instanceId, {
        agentId: newAgentId,
        agentMode: (data.agentMode as 'build' | 'plan' | 'review') || instance.agentMode,
        status: (data.status as InstanceStatus) || 'idle',
      });
    } else if ('error' in response) {
      console.error('Failed to change agent mode:', response.error);
    }
  }

  /**
   * Change model for an instance
   */
  async changeModel(instanceId: string, newModel: string): Promise<void> {
    const instance = this.stateService.getInstance(instanceId);
    if (!instance || instance.currentModel === newModel) return;

    const response = await this.ipc.changeModel(instanceId, newModel);

    if (response.success && 'data' in response && response.data) {
      const data = response.data as { currentModel?: string; status?: string };
      this.stateService.updateInstance(instanceId, {
        currentModel: data.currentModel || newModel,
        status: (data.status as InstanceStatus) || 'idle',
      });
    } else if ('error' in response) {
      console.error('Failed to change model:', response.error);
    }
  }

  /**
   * Open folder picker and change working directory for an instance
   */
  async selectWorkingDirectory(instanceId: string): Promise<void> {
    const instance = this.stateService.getInstance(instanceId);
    if (!instance) return;

    const folder = await this.ipc.selectFolder();
    if (!folder) return; // User cancelled

    const { displayName, parentId, yoloMode } = instance;
    await this.terminateInstance(instanceId);

    await this.createInstance({
      workingDirectory: folder,
      displayName,
      parentId: parentId || undefined,
      yoloMode,
    });
  }

  /**
   * Set working directory for an instance (terminates and recreates)
   * Similar to selectWorkingDirectory but accepts a path directly
   */
  async setWorkingDirectory(instanceId: string, folder: string): Promise<void> {
    const instance = this.stateService.getInstance(instanceId);
    if (!instance || !folder) return;

    const { displayName, parentId, yoloMode } = instance;
    await this.terminateInstance(instanceId);

    await this.createInstance({
      workingDirectory: folder,
      displayName,
      parentId: parentId || undefined,
      yoloMode,
    });
  }

  /**
   * Set output messages for an instance (used for restoring history)
   */
  setInstanceMessages(instanceId: string, messages: OutputMessage[]): void {
    this.stateService.updateInstance(instanceId, {
      outputBuffer: messages,
    });
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Deserialize instance data from IPC
   */
  deserializeInstance(data: unknown): Instance {
    const d = data as Record<string, unknown>;
    return {
      id: d['id'] as string,
      displayName: d['displayName'] as string,
      createdAt: d['createdAt'] as number,
      parentId: d['parentId'] as string | null,
      childrenIds: (d['childrenIds'] as string[]) || [],
      agentId: (d['agentId'] as string) || 'build',
      agentMode: (d['agentMode'] as 'build' | 'plan' | 'review') || 'build',
      provider: (d['provider'] as Instance['provider']) || 'claude',
      status: d['status'] as InstanceStatus,
      contextUsage: (d['contextUsage'] as Instance['contextUsage']) || {
        used: 0,
        total: 200000,
        percentage: 0,
      },
      lastActivity: d['lastActivity'] as number,
      sessionId: d['sessionId'] as string,
      workingDirectory: d['workingDirectory'] as string,
      yoloMode: (d['yoloMode'] as boolean) ?? false,
      outputBuffer: (d['outputBuffer'] as OutputMessage[]) || [],
    };
  }

  /**
   * Validate files before sending - returns array of error messages
   */
  validateFiles(files: File[]): string[] {
    const errors: string[] = [];
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? InstanceListStore.MAX_IMAGE_SIZE : InstanceListStore.MAX_FILE_SIZE;
      const maxSizeMB = isImage ? 5 : 30;

      // Images will be auto-compressed, so only show error if non-image is too large
      if (!isImage && file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        errors.push(`${file.name} is too large (${sizeMB}MB). Maximum size is ${maxSizeMB}MB.`);
      }
    }
    return errors;
  }

  /**
   * Convert a File to an attachment object for IPC
   */
  async fileToAttachment(file: File): Promise<{
    name: string;
    type: string;
    size: number;
    data: string;
  }> {
    let processedFile = file;

    // If it's an image and exceeds size limit, try to compress it
    if (file.type.startsWith('image/') && file.size > InstanceListStore.MAX_IMAGE_SIZE) {
      processedFile = await this.tryCompressImage(file);
    }

    return new Promise((resolve, reject) => {
      const isImage = processedFile.type.startsWith('image/');
      const maxSize = isImage ? InstanceListStore.MAX_IMAGE_SIZE : InstanceListStore.MAX_FILE_SIZE;
      const maxSizeMB = isImage ? 5 : 30;

      if (processedFile.size > maxSize) {
        reject(new Error(`File ${file.name} exceeds maximum size of ${maxSizeMB}MB`));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: processedFile.name,
          type: processedFile.type,
          size: processedFile.size,
          data: reader.result as string,
        });
      };
      reader.onerror = () => {
        reject(new Error(`Failed to read file ${file.name}`));
      };
      reader.readAsDataURL(processedFile);
    });
  }

  /**
   * Try to compress an image to fit within the 5MB limit
   */
  private async tryCompressImage(file: File): Promise<File> {
    const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

    for (const quality of qualities) {
      const compressed = await this.compressImage(file, quality);
      if (compressed && compressed.size <= InstanceListStore.MAX_IMAGE_SIZE) {
        const newFileName = file.name.replace(/\.[^.]+$/, '.webp');
        return new File([compressed], newFileName, { type: 'image/webp' });
      }
    }

    // If still too large, return original and let it fail with error
    return file;
  }

  /**
   * Compress an image to WebP format at the specified quality
   */
  private async compressImage(file: File, quality = 0.85): Promise<Blob | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Downscale if image exceeds maximum dimension
          const maxDim = InstanceListStore.MAX_IMAGE_DIMENSION;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              resolve(blob);
            },
            'image/webp',
            quality
          );
        };

        img.onerror = () => resolve(null);
        img.src = e.target?.result as string;
      };

      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
}
