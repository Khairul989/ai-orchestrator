/**
 * CLI Verification IPC Handlers
 * Handles CLI detection and multi-CLI verification
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { IpcResponse } from '../../shared/types/ipc.types';
import { CliDetectionService, CliInfo, CliType } from '../cli/cli-detection';
import { getCliVerificationCoordinator, CliVerificationConfig } from '../orchestration/cli-verification-extension';
import type { PersonalityType, SynthesisStrategy } from '../../shared/types/verification.types';

// ============================================
// Types
// ============================================

interface CliDetectAllPayload {
  force?: boolean;
}

interface CliDetectOnePayload {
  command: string;
}

interface CliTestConnectionPayload {
  command: string;
}

interface CliVerificationStartPayload {
  id: string;
  prompt: string;
  context?: string;
  config: {
    cliAgents?: CliType[];
    agentCount?: number;
    synthesisStrategy?: string;
    personalities?: string[];
    confidenceThreshold?: number;
    timeout?: number;
    maxDebateRounds?: number;
    fallbackToApi?: boolean;
    mixedMode?: boolean;
  };
}

interface CliVerificationCancelPayload {
  id: string;
}

// ============================================
// Handler Registration
// ============================================

export function registerCliVerificationHandlers(mainWindow: BrowserWindow): void {
  const cliDetection = CliDetectionService.getInstance();
  const coordinator = getCliVerificationCoordinator();

  // ============================================
  // CLI Detection Handlers
  // ============================================

  // Detect all CLIs
  ipcMain.handle(
    'cli:detect-all',
    async (
      _event: IpcMainInvokeEvent,
      payload: CliDetectAllPayload
    ): Promise<IpcResponse> => {
      try {
        const result = await cliDetection.detectAll(payload?.force);
        return {
          success: true,
          data: {
            timestamp: result.timestamp,
            detected: result.detected,
            available: result.available,
            unavailable: result.detected.filter((cli) => !cli.installed),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CLI_DETECT_ALL_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // Detect single CLI
  ipcMain.handle(
    'cli:detect-one',
    async (
      _event: IpcMainInvokeEvent,
      payload: CliDetectOnePayload
    ): Promise<IpcResponse> => {
      try {
        const cliInfo = await cliDetection.detectOne(payload.command as CliType);
        return { success: true, data: cliInfo };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CLI_DETECT_ONE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // Test CLI connection
  ipcMain.handle(
    'cli:test-connection',
    async (
      _event: IpcMainInvokeEvent,
      payload: CliTestConnectionPayload
    ): Promise<IpcResponse> => {
      try {
        const cliInfo = await cliDetection.detectOne(payload.command as CliType);
        return {
          success: true,
          data: {
            success: cliInfo.installed && cliInfo.authenticated !== false,
            version: cliInfo.version,
            authenticated: cliInfo.authenticated,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CLI_TEST_CONNECTION_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // ============================================
  // CLI Verification Handlers
  // ============================================

  // Set up event forwarding from coordinator to renderer
  setupCoordinatorEvents(coordinator, mainWindow);

  // Start CLI verification
  ipcMain.handle(
    'verification:start-cli',
    async (
      _event: IpcMainInvokeEvent,
      payload: CliVerificationStartPayload
    ): Promise<IpcResponse> => {
      try {
        const config: CliVerificationConfig = {
          agentCount: payload.config.agentCount || 3,
          cliAgents: payload.config.cliAgents,
          synthesisStrategy: (payload.config.synthesisStrategy as SynthesisStrategy) || 'debate',
          personalities: payload.config.personalities as PersonalityType[],
          confidenceThreshold: payload.config.confidenceThreshold || 0.7,
          timeout: payload.config.timeout || 300000,
          maxDebateRounds: payload.config.maxDebateRounds || 4,
          preferCli: true,
          fallbackToApi: payload.config.fallbackToApi ?? true,
          mixedMode: payload.config.mixedMode ?? false,
        };

        // Start verification (async - result sent via events)
        coordinator.startVerificationWithCli(
          { prompt: payload.prompt, context: payload.context },
          config
        ).then((result) => {
          mainWindow.webContents.send('verification:complete', {
            sessionId: payload.id,
            result,
          });
        }).catch((error) => {
          mainWindow.webContents.send('verification:error', {
            sessionId: payload.id,
            error: (error as Error).message,
          });
        });

        return { success: true, data: { verificationId: payload.id } };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'VERIFY_CLI_START_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );

  // Cancel verification
  ipcMain.handle(
    'verification:cancel',
    async (
      _event: IpcMainInvokeEvent,
      _payload: CliVerificationCancelPayload
    ): Promise<IpcResponse> => {
      try {
        // Note: CliVerificationCoordinator doesn't have cancel yet
        // This would need to be implemented
        return { success: true, data: null };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'VERIFY_CANCEL_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        };
      }
    }
  );
}

// ============================================
// Event Forwarding
// ============================================

function setupCoordinatorEvents(
  coordinator: ReturnType<typeof getCliVerificationCoordinator>,
  mainWindow: BrowserWindow
): void {
  // Forward verification events to renderer
  coordinator.on('verification:started', (data) => {
    mainWindow.webContents.send('verification:started', data);
  });

  coordinator.on('verification:agents-launching', (data) => {
    // Forward individual agent starts
    for (const agent of data.agents) {
      mainWindow.webContents.send('verification:agent-start', {
        sessionId: data.requestId,
        agentId: `${data.requestId}-${agent.name}`,
        name: agent.name,
        type: agent.type,
        personality: agent.personality,
      });
    }
  });

  // Forward agent streaming events
  coordinator.on('verification:agent-stream', (data) => {
    mainWindow.webContents.send('verification:agent-stream', {
      sessionId: data.requestId,
      agentId: data.agentId,
      agentName: data.agentName,
      content: data.content,
      totalContent: data.totalContent,
    });
  });

  // Forward agent complete events
  coordinator.on('verification:agent-complete', (data) => {
    mainWindow.webContents.send('verification:agent-complete', {
      sessionId: data.requestId,
      agentId: data.agentId,
      agentName: data.agentName,
      success: data.success,
      error: data.error,
      responseLength: data.responseLength,
      tokens: data.tokens,
    });
  });

  coordinator.on('verification:completed', (result) => {
    mainWindow.webContents.send('verification:complete', {
      sessionId: result.id,
      result,
    });
  });

  coordinator.on('verification:error', (data) => {
    mainWindow.webContents.send('verification:error', {
      sessionId: data.requestId,
      error: data.error?.message || 'Unknown error',
    });
  });

  coordinator.on('warning', (data) => {
    mainWindow.webContents.send('verification:warning', data);
  });
}
