/**
 * Instance IPC Handlers
 * Handles instance lifecycle, control, and user action requests
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, IpcResponse } from '../../../shared/types/ipc.types';
import type {
  InstanceCreatePayload,
  InstanceSendInputPayload,
  InstanceTerminatePayload,
  InstanceInterruptPayload,
  InstanceRestartPayload,
  InstanceRenamePayload
} from '../../../shared/types/ipc.types';
import {
  InstanceCreatePayloadSchema,
  InstanceSendInputPayloadSchema,
  InstanceTerminatePayloadSchema,
  InstanceRenamePayloadSchema,
  InstanceChangeAgentPayloadSchema,
  InstanceChangeModelPayloadSchema,
  InputRequiredResponsePayloadSchema,
  UserActionResponsePayloadSchema,
  validateIpcPayload
} from '../../../shared/validation/ipc-schemas';
import { InstanceManager } from '../../instance/instance-manager';
import { WindowManager } from '../../window-manager';
import { getSettingsManager } from '../../core/config/settings-manager';

/**
 * Serialize instance for IPC response
 */
function serializeInstance(instance: any): Record<string, unknown> {
  return {
    ...instance,
    communicationTokens:
      instance.communicationTokens instanceof Map
        ? Object.fromEntries(instance.communicationTokens)
        : instance.communicationTokens
  };
}

export function registerInstanceHandlers(deps: {
  instanceManager: InstanceManager;
  windowManager: WindowManager;
}): void {
  const { instanceManager } = deps;

  // ============================================
  // Instance Lifecycle Handlers
  // ============================================

  // Create instance
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_CREATE,
    async (
      event: IpcMainInvokeEvent,
      payload: InstanceCreatePayload
    ): Promise<IpcResponse> => {
      try {
        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          InstanceCreatePayloadSchema,
          payload,
          'INSTANCE_CREATE'
        );

        // Use default working directory from settings if not provided or is just '.'
        let workingDirectory = validatedPayload.workingDirectory;
        if (!workingDirectory || workingDirectory === '.') {
          const settings = getSettingsManager();
          const defaultDir = settings.get('defaultWorkingDirectory');
          if (defaultDir) {
            workingDirectory = defaultDir;
          } else {
            workingDirectory = process.cwd();
          }
        }

        const instance = await instanceManager.createInstance({
          workingDirectory,
          sessionId: validatedPayload.sessionId,
          parentId: validatedPayload.parentInstanceId,
          displayName: validatedPayload.displayName,
          initialPrompt: validatedPayload.initialPrompt,
          attachments: payload.attachments, // Use original for proper typing
          yoloMode: validatedPayload.yoloMode,
          agentId: validatedPayload.agentId,
          provider: payload.provider, // Use original for proper typing
          modelOverride: validatedPayload.model
        });

        return {
          success: true,
          data: serializeInstance(instance)
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CREATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Create instance with initial message
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_CREATE_WITH_MESSAGE,
    async (
      event: IpcMainInvokeEvent,
      payload: {
        workingDirectory: string;
        message: string;
        attachments?: any[];
        provider?: 'claude' | 'openai' | 'gemini' | 'copilot' | 'auto';
        model?: string;
      }
    ): Promise<IpcResponse> => {
      try {
        // Use default working directory from settings if not provided or is just '.'
        let workingDirectory = payload.workingDirectory;
        if (!workingDirectory || workingDirectory === '.') {
          const settings = getSettingsManager();
          const defaultDir = settings.get('defaultWorkingDirectory');
          if (defaultDir) {
            workingDirectory = defaultDir;
          } else {
            workingDirectory = process.cwd();
          }
        }

        const instance = await instanceManager.createInstance({
          workingDirectory,
          initialPrompt: payload.message,
          attachments: payload.attachments,
          provider: payload.provider,
          modelOverride: payload.model
        });

        return {
          success: true,
          data: serializeInstance(instance)
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CREATE_WITH_MESSAGE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Send input to instance
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_SEND_INPUT,
    async (
      event: IpcMainInvokeEvent,
      payload: InstanceSendInputPayload
    ): Promise<IpcResponse> => {
      try {
        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          InstanceSendInputPayloadSchema,
          payload,
          'INSTANCE_SEND_INPUT'
        );

        console.log('IPC INSTANCE_SEND_INPUT received:', {
          instanceId: validatedPayload.instanceId,
          messageLength: validatedPayload.message?.length,
          attachmentsCount: validatedPayload.attachments?.length ?? 0,
          attachmentNames: validatedPayload.attachments?.map((a) => a.name)
        });

        await instanceManager.sendInput(
          validatedPayload.instanceId,
          validatedPayload.message,
          validatedPayload.attachments
        );

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SEND_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Terminate instance
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_TERMINATE,
    async (
      event: IpcMainInvokeEvent,
      payload: InstanceTerminatePayload
    ): Promise<IpcResponse> => {
      try {
        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          InstanceTerminatePayloadSchema,
          payload,
          'INSTANCE_TERMINATE'
        );

        await instanceManager.terminateInstance(
          validatedPayload.instanceId,
          validatedPayload.graceful ?? true
        );

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'TERMINATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Interrupt instance (Ctrl+C equivalent)
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_INTERRUPT,
    async (
      event: IpcMainInvokeEvent,
      payload: InstanceInterruptPayload
    ): Promise<IpcResponse> => {
      try {
        const success = instanceManager.interruptInstance(payload.instanceId);

        return {
          success,
          data: { interrupted: success }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'INTERRUPT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Restart instance
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_RESTART,
    async (
      event: IpcMainInvokeEvent,
      payload: InstanceRestartPayload
    ): Promise<IpcResponse> => {
      try {
        await instanceManager.restartInstance(payload.instanceId);

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'RESTART_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Rename instance
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_RENAME,
    async (
      event: IpcMainInvokeEvent,
      payload: InstanceRenamePayload
    ): Promise<IpcResponse> => {
      try {
        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          InstanceRenamePayloadSchema,
          payload,
          'INSTANCE_RENAME'
        );

        instanceManager.renameInstance(
          validatedPayload.instanceId,
          validatedPayload.displayName
        );

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'RENAME_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Change agent mode (preserves conversation context)
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_CHANGE_AGENT_MODE,
    async (
      event: IpcMainInvokeEvent,
      payload: { instanceId: string; agentId: string }
    ): Promise<IpcResponse> => {
      try {
        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          InstanceChangeAgentPayloadSchema,
          payload,
          'INSTANCE_CHANGE_AGENT_MODE'
        );

        const instance = await instanceManager.changeAgentMode(
          validatedPayload.instanceId,
          validatedPayload.agentId
        );

        return {
          success: true,
          data: instanceManager.serializeForIpc(instance)
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CHANGE_AGENT_MODE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Toggle YOLO mode (preserves conversation context)
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_TOGGLE_YOLO_MODE,
    async (
      event: IpcMainInvokeEvent,
      payload: { instanceId: string }
    ): Promise<IpcResponse> => {
      try {
        const instance = await instanceManager.toggleYoloMode(
          payload.instanceId
        );

        return {
          success: true,
          data: instanceManager.serializeForIpc(instance)
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'TOGGLE_YOLO_MODE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Change model (preserves conversation context)
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_CHANGE_MODEL,
    async (
      event: IpcMainInvokeEvent,
      payload: { instanceId: string; model: string }
    ): Promise<IpcResponse> => {
      try {
        const validatedPayload = validateIpcPayload(
          InstanceChangeModelPayloadSchema,
          payload,
          'INSTANCE_CHANGE_MODEL'
        );

        const instance = await instanceManager.changeModel(
          validatedPayload.instanceId,
          validatedPayload.model
        );

        return {
          success: true,
          data: instanceManager.serializeForIpc(instance)
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CHANGE_MODEL_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Terminate all instances
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_TERMINATE_ALL,
    async (): Promise<IpcResponse> => {
      try {
        await instanceManager.terminateAllInstances();

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'TERMINATE_ALL_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get all instances
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_LIST,
    async (): Promise<IpcResponse> => {
      try {
        const instances = instanceManager.getAllInstancesForIpc();

        return {
          success: true,
          data: instances
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // ============================================
  // User Action Handlers
  // ============================================

  // Respond to a user action request
  ipcMain.handle(
    IPC_CHANNELS.USER_ACTION_RESPOND,
    async (
      event: IpcMainInvokeEvent,
      payload: { requestId: string; approved: boolean; selectedOption?: string }
    ): Promise<IpcResponse> => {
      try {
        // Map the payload to match the schema (action is approve/reject/custom, not approved)
        const mappedPayload = {
          requestId: payload.requestId,
          action: payload.approved ? 'approve' : 'reject' as const,
          customValue: payload.selectedOption
        };

        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          UserActionResponsePayloadSchema,
          mappedPayload,
          'USER_ACTION_RESPOND'
        );

        const orchestration = instanceManager.getOrchestrationHandler();
        orchestration.respondToUserAction(
          validatedPayload.requestId,
          validatedPayload.action === 'approve',
          validatedPayload.customValue
        );

        return {
          success: true,
          data: { requestId: validatedPayload.requestId, responded: true }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'USER_ACTION_RESPOND_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // List all pending user action requests
  ipcMain.handle(
    IPC_CHANNELS.USER_ACTION_LIST,
    async (): Promise<IpcResponse> => {
      try {
        const orchestration = instanceManager.getOrchestrationHandler();
        const requests = orchestration.getPendingUserActions();

        return {
          success: true,
          data: requests
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'USER_ACTION_LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // List pending user action requests for a specific instance
  ipcMain.handle(
    IPC_CHANNELS.USER_ACTION_LIST_FOR_INSTANCE,
    async (
      event: IpcMainInvokeEvent,
      payload: { instanceId: string }
    ): Promise<IpcResponse> => {
      try {
        const orchestration = instanceManager.getOrchestrationHandler();
        const requests = orchestration.getPendingUserActionsForInstance(
          payload.instanceId
        );

        return {
          success: true,
          data: requests
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'USER_ACTION_LIST_FOR_INSTANCE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Handle input required responses (permission prompts)
  ipcMain.handle(
    IPC_CHANNELS.INPUT_REQUIRED_RESPOND,
    async (
      event: IpcMainInvokeEvent,
      payload: {
        instanceId: string;
        requestId: string;
        response: string;
        permissionKey?: string;
      }
    ): Promise<IpcResponse> => {
      try {
        // Validate payload at IPC boundary
        const validatedPayload = validateIpcPayload(
          InputRequiredResponsePayloadSchema,
          payload,
          'INPUT_REQUIRED_RESPOND'
        );

        // Send the response to the CLI via stdin
        await instanceManager.sendInputResponse(
          validatedPayload.instanceId,
          validatedPayload.response,
          validatedPayload.permissionKey
        );

        return {
          success: true,
          data: { requestId: validatedPayload.requestId, responded: true }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'INPUT_REQUIRED_RESPOND_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );
}
