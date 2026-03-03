/**
 * Cross-Instance Communication IPC Handlers
 *
 * Registers IPC handlers for bridge and message management between instances.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getLogger } from '../../logging/logger';
import { IPC_CHANNELS, IpcResponse } from '../../../shared/types/ipc.types';
import { getCrossInstanceComm } from '../../communication/cross-instance-comm';

const logger = getLogger('CommunicationHandlers');

export function registerCommunicationHandlers(): void {
  const comm = getCrossInstanceComm();

  // ============================================
  // Bridge Management
  // ============================================

  // Create a new communication bridge between two instances
  ipcMain.handle(
    IPC_CHANNELS.COMM_CREATE_BRIDGE,
    async (_event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse> => {
      try {
        const { name, sourceInstanceId, targetInstanceId } = payload as {
          name: string;
          sourceInstanceId: string;
          targetInstanceId: string;
        };

        if (!name || !sourceInstanceId || !targetInstanceId) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name, sourceInstanceId, and targetInstanceId are required',
              timestamp: Date.now(),
            },
          };
        }

        const bridge = comm.createBridge(name, sourceInstanceId, targetInstanceId);

        logger.info('COMM_CREATE_BRIDGE handled', { bridgeId: bridge.id });

        return {
          success: true,
          data: bridge,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CREATE_BRIDGE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // Delete an existing communication bridge
  ipcMain.handle(
    IPC_CHANNELS.COMM_DELETE_BRIDGE,
    async (_event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse> => {
      try {
        const { bridgeId } = payload as { bridgeId: string };

        if (!bridgeId) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'bridgeId is required',
              timestamp: Date.now(),
            },
          };
        }

        const deleted = comm.deleteBridge(bridgeId);

        return {
          success: true,
          data: deleted,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'DELETE_BRIDGE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // List all bridges
  ipcMain.handle(
    IPC_CHANNELS.COMM_GET_BRIDGES,
    async (): Promise<IpcResponse> => {
      try {
        const bridges = comm.getBridges();

        return {
          success: true,
          data: bridges,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'GET_BRIDGES_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // ============================================
  // Messaging
  // ============================================

  // Send a message over a bridge
  ipcMain.handle(
    IPC_CHANNELS.COMM_SEND_MESSAGE,
    async (_event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse> => {
      try {
        const { bridgeId, fromInstanceId, content, metadata } = payload as {
          bridgeId: string;
          fromInstanceId: string;
          content: string;
          metadata?: Record<string, unknown>;
        };

        if (!bridgeId || !fromInstanceId || content === undefined) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'bridgeId, fromInstanceId, and content are required',
              timestamp: Date.now(),
            },
          };
        }

        const message = comm.sendMessage(bridgeId, fromInstanceId, content, metadata);

        return {
          success: true,
          data: message,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SEND_MESSAGE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // Retrieve messages for a bridge
  ipcMain.handle(
    IPC_CHANNELS.COMM_GET_MESSAGES,
    async (_event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse> => {
      try {
        const { bridgeId, limit } = payload as {
          bridgeId: string;
          limit?: number;
        };

        if (!bridgeId) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'bridgeId is required',
              timestamp: Date.now(),
            },
          };
        }

        const messages = comm.getMessages(bridgeId, limit);

        return {
          success: true,
          data: messages,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'GET_MESSAGES_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // ============================================
  // Subscriptions
  // ============================================

  // Subscribe an instance to a bridge
  ipcMain.handle(
    IPC_CHANNELS.COMM_SUBSCRIBE,
    async (_event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse> => {
      try {
        const { instanceId, bridgeId } = payload as {
          instanceId: string;
          bridgeId: string;
        };

        if (!instanceId || !bridgeId) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'instanceId and bridgeId are required',
              timestamp: Date.now(),
            },
          };
        }

        const subscribed = comm.subscribe(instanceId, bridgeId);

        return {
          success: true,
          data: subscribed,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SUBSCRIBE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // ============================================
  // Auth token
  // ============================================

  // Generate a one-time auth token (UUID) for inter-instance communication
  ipcMain.handle(
    IPC_CHANNELS.COMM_REQUEST_TOKEN,
    async (): Promise<IpcResponse> => {
      try {
        const token = crypto.randomUUID();

        return {
          success: true,
          data: { token },
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REQUEST_TOKEN_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );
}
