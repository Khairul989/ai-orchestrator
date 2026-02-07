/**
 * Orchestrator Executor - Runs tasks using AI Orchestrator in headless mode
 *
 * Uses the headless driver to import orchestrator services directly,
 * bypassing Electron. This allows benchmarking the full orchestrator stack
 * (child spawning, context compaction, RLM) from the command line.
 */

import { OrchestratorDriver } from './headless/orchestrator-driver.js';
import type { BenchmarkTask, ExecutorResult, ContextStage } from '../types.js';

export interface OrchestratorExecutorOptions {
  /** Pre-filled context messages to send before the task */
  contextMessages?: string[];
  /** Maximum time to wait in milliseconds */
  timeoutMs?: number;
}

/**
 * Execute a task using AI Orchestrator (headless mode)
 */
export async function executeOrchestrator(
  task: BenchmarkTask,
  options: OrchestratorExecutorOptions = {}
): Promise<ExecutorResult> {
  const driver = new OrchestratorDriver();
  return driver.execute(task, options);
}

/**
 * Build context messages for a given context stage
 * (Same as vanilla executor for consistency)
 */
export function buildContextMessages(stage: ContextStage, workingDirectory: string): string[] {
  switch (stage) {
    case 'fresh':
      return [];
    case 'moderate':
      return getModerateContextMessages(workingDirectory);
    case 'heavy':
      return getHeavyContextMessages(workingDirectory);
  }
}

function getModerateContextMessages(_workingDirectory: string): string[] {
  return [
    'Previous task: Explored the codebase structure and identified main components.',
    'Previous task: Analyzed the instance management system.',
    'Previous task: Reviewed the IPC communication patterns.',
  ];
}

function getHeavyContextMessages(_workingDirectory: string): string[] {
  return [
    ...getModerateContextMessages(_workingDirectory),
    'Previous task: Deep dive into orchestration handler implementation.',
    'Previous task: Analyzed all error handling paths.',
    'Previous task: Reviewed memory management and caching systems.',
    'Previous task: Traced request flow from UI to backend.',
    'Previous task: Examined test coverage and testing patterns.',
  ];
}
