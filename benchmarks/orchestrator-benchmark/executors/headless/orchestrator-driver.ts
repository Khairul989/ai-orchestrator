/**
 * Orchestrator Driver - Headless driver for benchmarking the orchestrator
 *
 * Imports the real orchestrator services (InstanceManager, etc.) from compiled
 * dist/ output, using the electron-shim to mock Electron dependencies.
 *
 * This allows benchmarking the full orchestrator stack (child spawning,
 * context compaction, RLM, etc.) without running the Electron app.
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import type { BenchmarkTask, ExecutorResult } from '../../types.js';

// createRequire gives us a CJS require() function that works in ESM context.
// This is needed because the orchestrator dist/ is compiled as CommonJS.
const require = createRequire(import.meta.url);

// CRITICAL: Load the electron shim BEFORE any orchestrator imports.
// The shim registers mock 'electron' and 'electron-store' modules in require.cache.
const electronShim = require('./electron-shim.cjs');

// Now we can safely import from the compiled orchestrator dist (CommonJS).
const { getInstanceManager } = require('../../../../dist/main/instance/instance-manager');
const { getSettingsManager } = require('../../../../dist/main/core/config/settings-manager');

export interface OrchestratorDriverOptions {
  contextMessages?: string[];
  timeoutMs?: number;
}

// Minimal type interfaces matching the compiled orchestrator code
interface OutputMessage {
  type: string;
  content: string;
}

interface ContextUsage {
  used: number;
  total: number;
  percentage: number;
}

interface StateUpdatePayload {
  instanceId: string;
  status: string;
  contextUsage?: ContextUsage;
}

interface BatchUpdatePayload {
  updates: StateUpdatePayload[];
}

interface OutputPayload {
  instanceId: string;
  message: OutputMessage;
}

interface OrchestratorInstance {
  id: string;
  status: string;
  parentId: string | null;
  totalTokensUsed: number;
}

/**
 * Headless orchestrator driver for benchmark execution.
 * Each call to execute() creates a fresh InstanceManager, runs the task,
 * and cleans up all state.
 */
export class OrchestratorDriver {
  /**
   * Execute a benchmark task through the real orchestrator stack.
   */
  async execute(
    task: BenchmarkTask,
    options: OrchestratorDriverOptions = {}
  ): Promise<ExecutorResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? task.timeoutMinutes * 60 * 1000;
    const cwd = resolve(task.workingDirectory);

    // Verify dist/ exists
    const distPath = resolve(import.meta.dirname, '../../../../dist/main/instance/instance-manager.js');
    if (!existsSync(distPath)) {
      return {
        output: '',
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: 'Orchestrator not compiled. Run "npm run build:main" first.',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let instanceManager: any;

    try {
      // Initialize settings for benchmark mode
      const settings = getSettingsManager();
      settings.update({
        enableDiskStorage: false,
        persistSessionContent: false,
        maxTotalInstances: 20,
        autoTerminateIdleMinutes: 0,
        defaultCli: 'claude',
      });

      instanceManager = getInstanceManager();

      const result = await this.runTask(instanceManager, task, cwd, options, timeoutMs);

      return {
        output: result.output,
        tokensUsed: result.tokensUsed,
        durationMs: Date.now() - startTime,
        error: result.error,
      };
    } catch (err) {
      return {
        output: '',
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: `Driver error: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      await this.cleanup(instanceManager);
    }
  }

  /**
   * Run a single task and wait for completion.
   */
  private runTask(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    instanceManager: any,
    task: BenchmarkTask,
    cwd: string,
    options: OrchestratorDriverOptions,
    timeoutMs: number
  ): Promise<{ output: string; tokensUsed: number; error?: string }> {
    return new Promise((resolvePromise) => {
      let output = '';
      const tokensByInstance = new Map<string, number>();
      let rootInstanceId: string | null = null;
      let settled = false;

      function settle(result: { output: string; tokensUsed: number; error?: string }) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        instanceManager.removeListener('instance:output', onOutput);
        instanceManager.removeListener('instance:batch-update', onBatchUpdate);
        instanceManager.removeListener('instance:state-update', onStateUpdate);
        resolvePromise(result);
      }

      function getTotalTokens(): number {
        let total = 0;
        for (const t of tokensByInstance.values()) total += t;
        return total;
      }

      // Listen for output from the root instance (assistant messages)
      const onOutput = (payload: OutputPayload) => {
        if (payload.instanceId !== rootInstanceId) return;
        if (payload.message.type === 'assistant' && payload.message.content) {
          output += payload.message.content + '\n';
        }
      };

      // Batch updates carry status + contextUsage for all instances
      const onBatchUpdate = (payload: BatchUpdatePayload) => {
        for (const update of payload.updates) {
          // Track tokens for ALL instances (parent + children)
          if (update.contextUsage) {
            tokensByInstance.set(update.instanceId, update.contextUsage.used);
          }

          // Detect root instance completion
          if (update.instanceId === rootInstanceId && update.status === 'idle') {
            // Small delay to allow final output events to flush
            setTimeout(() => {
              settle({
                output: output.trim(),
                tokensUsed: getTotalTokens(),
              });
            }, 500);
          }
        }
      };

      // State updates from lifecycle (also carry status)
      const onStateUpdate = (payload: StateUpdatePayload) => {
        if (payload.contextUsage) {
          tokensByInstance.set(payload.instanceId, payload.contextUsage.used);
        }

        if (payload.instanceId === rootInstanceId && payload.status === 'idle') {
          setTimeout(() => {
            settle({
              output: output.trim(),
              tokensUsed: getTotalTokens(),
            });
          }, 500);
        }
      };

      instanceManager.on('instance:output', onOutput);
      instanceManager.on('instance:batch-update', onBatchUpdate);
      instanceManager.on('instance:state-update', onStateUpdate);

      // Build prompt with context
      let fullPrompt = task.prompt;
      if (options.contextMessages && options.contextMessages.length > 0) {
        const contextSection = options.contextMessages.join('\n\n---\n\n');
        fullPrompt = `Previous conversation context:\n${contextSection}\n\n---\n\nCurrent task:\n${task.prompt}`;
      }

      // Create the root instance
      instanceManager
        .createInstance({
          workingDirectory: cwd,
          initialPrompt: fullPrompt,
          yoloMode: true, // Auto-approve in benchmarks
          displayName: `Benchmark: ${task.id}`,
        })
        .then((instance: OrchestratorInstance) => {
          rootInstanceId = instance.id;
        })
        .catch((err: Error) => {
          settle({
            output: '',
            tokensUsed: 0,
            error: `Failed to create instance: ${err.message}`,
          });
        });

      // Timeout handler
      const timeout = setTimeout(() => {
        settle({
          output: output.trim() || 'Timeout: Task exceeded time limit',
          tokensUsed: getTotalTokens(),
          error: `Timeout after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    });
  }

  /**
   * Clean up all instances and temp directories.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async cleanup(instanceManager?: any): Promise<void> {
    if (instanceManager) {
      try {
        await instanceManager.terminateAll();
      } catch {
        // Best effort
      }
    }

    // Give processes a moment to exit
    await new Promise((r) => setTimeout(r, 500));

    // Clean up temp directories created by the shim
    electronShim.cleanup();
  }
}
