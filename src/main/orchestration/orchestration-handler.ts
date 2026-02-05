/**
 * Orchestration Handler - Executes orchestrator commands from Claude instances
 */

import { EventEmitter } from 'events';
import {
  OrchestratorCommand,
  SpawnChildCommand,
  MessageChildCommand,
  TerminateChildCommand,
  GetChildOutputCommand,
  ReportTaskCompleteCommand,
  ReportProgressCommand,
  ReportErrorCommand,
  GetTaskStatusCommand,
  RequestUserActionCommand,
  parseOrchestratorCommands,
  formatCommandResponse,
  generateOrchestrationPrompt
} from './orchestration-protocol';
import { getTaskManager } from './task-manager';
import { getChildResultStorage } from './child-result-storage';
import type {
  TaskExecution,
  TaskResult,
  TaskProgress,
  TaskError
} from '../../shared/types/task.types';
import type { RoutingDecision } from '../routing';
import type {
  ReportResultCommand,
  GetChildSummaryCommand,
  GetChildArtifactsCommand,
  GetChildSectionCommand,
  ChildSummaryResponse,
  ChildArtifactsResponse,
  ChildSectionResponse,
} from '../../shared/types/child-result.types';

export interface OrchestrationContext {
  instanceId: string;
  workingDirectory: string;
  parentId: string | null;
  childrenIds: string[];
}

/**
 * Pending user action request (forwarded to UI)
 */
export interface UserActionRequest {
  id: string;
  instanceId: string;
  requestType: RequestUserActionCommand['requestType'];
  title: string;
  message: string;
  targetMode?: 'build' | 'plan' | 'review';
  options?: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  context?: Record<string, unknown>;
  createdAt: number;
}

export interface OrchestrationEvents {
  'spawn-child': (parentId: string, command: SpawnChildCommand) => void;
  'message-child': (parentId: string, command: MessageChildCommand) => void;
  'terminate-child': (parentId: string, command: TerminateChildCommand) => void;
  'get-children': (
    parentId: string,
    callback: (children: ChildInfo[]) => void
  ) => void;
  'get-child-output': (
    parentId: string,
    command: GetChildOutputCommand,
    callback: (output: string[]) => void
  ) => void;
  'inject-response': (instanceId: string, response: string) => void;
  'task-complete': (
    parentId: string,
    childId: string,
    task: TaskExecution
  ) => void;
  'task-progress': (
    parentId: string,
    childId: string,
    progress: TaskProgress
  ) => void;
  'task-error': (parentId: string, childId: string, error: TaskError) => void;
  'user-action-request': (request: UserActionRequest) => void;
  // New structured result events
  'report-result': (
    childId: string,
    command: ReportResultCommand,
    callback: (response: ChildSummaryResponse | null) => void
  ) => void;
  'get-child-summary': (
    parentId: string,
    command: GetChildSummaryCommand,
    callback: (response: ChildSummaryResponse | null) => void
  ) => void;
  'get-child-artifacts': (
    parentId: string,
    command: GetChildArtifactsCommand,
    callback: (response: ChildArtifactsResponse | null) => void
  ) => void;
  'get-child-section': (
    parentId: string,
    command: GetChildSectionCommand,
    callback: (response: ChildSectionResponse | null) => void
  ) => void;
}

export interface ChildInfo {
  id: string;
  name: string;
  status: string;
  createdAt: number;
}

export class OrchestrationHandler extends EventEmitter {
  private contexts: Map<string, OrchestrationContext> = new Map();
  private pendingUserActions: Map<string, UserActionRequest> = new Map();

  /**
   * Register an instance for orchestration
   */
  registerInstance(
    instanceId: string,
    workingDirectory: string,
    parentId: string | null = null
  ): void {
    this.contexts.set(instanceId, {
      instanceId,
      workingDirectory,
      parentId,
      childrenIds: []
    });
  }

  /**
   * Unregister an instance
   */
  unregisterInstance(instanceId: string): void {
    this.contexts.delete(instanceId);

    // Remove from parent's children list
    for (const ctx of this.contexts.values()) {
      ctx.childrenIds = ctx.childrenIds.filter((id) => id !== instanceId);
    }
  }

  /**
   * Add a child to a parent's context
   */
  addChild(parentId: string, childId: string): void {
    const ctx = this.contexts.get(parentId);
    if (ctx && !ctx.childrenIds.includes(childId)) {
      ctx.childrenIds.push(childId);
    }
  }

  /**
   * Get the orchestration prompt to prepend to the first message
   */
  getOrchestrationPrompt(instanceId: string, currentModel?: string): string {
    return generateOrchestrationPrompt(instanceId, currentModel);
  }

  /**
   * Process output from an instance and execute any orchestrator commands
   */
  processOutput(instanceId: string, output: string): void {
    const commands = parseOrchestratorCommands(output);

    for (const command of commands) {
      this.executeCommand(instanceId, command);
    }
  }

  /**
   * Execute an orchestrator command
   */
  private executeCommand(
    instanceId: string,
    command: OrchestratorCommand
  ): void {
    const ctx = this.contexts.get(instanceId);
    if (!ctx) {
      console.warn(`No orchestration context for instance ${instanceId}`);
      return;
    }

    console.log(
      `Orchestrator: Executing ${command.action} from instance ${instanceId}`
    );

    switch (command.action) {
      case 'spawn_child':
        this.handleSpawnChild(instanceId, command);
        break;

      case 'message_child':
        this.handleMessageChild(instanceId, command);
        break;

      case 'get_children':
        this.handleGetChildren(instanceId);
        break;

      case 'terminate_child':
        this.handleTerminateChild(instanceId, command);
        break;

      case 'get_child_output':
        this.handleGetChildOutput(instanceId, command);
        break;

      case 'report_task_complete':
        this.handleReportTaskComplete(instanceId, command);
        break;

      case 'report_progress':
        this.handleReportProgress(instanceId, command);
        break;

      case 'report_error':
        this.handleReportError(instanceId, command);
        break;

      case 'get_task_status':
        this.handleGetTaskStatus(instanceId, command);
        break;

      case 'request_user_action':
        this.handleRequestUserAction(instanceId, command);
        break;

      // New structured result commands
      case 'report_result':
        this.handleReportResult(instanceId, command);
        break;

      case 'get_child_summary':
        this.handleGetChildSummary(instanceId, command);
        break;

      case 'get_child_artifacts':
        this.handleGetChildArtifacts(instanceId, command);
        break;

      case 'get_child_section':
        this.handleGetChildSection(instanceId, command);
        break;
    }
  }

  private handleSpawnChild(parentId: string, command: SpawnChildCommand): void {
    this.emit('spawn-child', parentId, command);
  }

  private handleMessageChild(
    parentId: string,
    command: MessageChildCommand
  ): void {
    const ctx = this.contexts.get(parentId);
    if (!ctx) return;

    // Verify the child belongs to this parent
    if (!ctx.childrenIds.includes(command.childId)) {
      this.injectResponse(parentId, 'message_child', false, {
        error: `Child ${command.childId} not found or not owned by you`
      });
      return;
    }

    this.emit('message-child', parentId, command);
  }

  private handleGetChildren(parentId: string): void {
    this.emit('get-children', parentId, (children: ChildInfo[]) => {
      this.injectResponse(parentId, 'get_children', true, { children });
    });
  }

  private handleTerminateChild(
    parentId: string,
    command: TerminateChildCommand
  ): void {
    const ctx = this.contexts.get(parentId);
    if (!ctx) return;

    // Verify the child belongs to this parent
    if (!ctx.childrenIds.includes(command.childId)) {
      this.injectResponse(parentId, 'terminate_child', false, {
        error: `Child ${command.childId} not found or not owned by you`
      });
      return;
    }

    this.emit('terminate-child', parentId, command);
  }

  private handleGetChildOutput(
    parentId: string,
    command: GetChildOutputCommand
  ): void {
    const ctx = this.contexts.get(parentId);
    if (!ctx) return;

    // Verify the child belongs to this parent
    if (!ctx.childrenIds.includes(command.childId)) {
      this.injectResponse(parentId, 'get_child_output', false, {
        error: `Child ${command.childId} not found or not owned by you`
      });
      return;
    }

    this.emit('get-child-output', parentId, command, (output: string[]) => {
      this.injectResponse(parentId, 'get_child_output', true, {
        childId: command.childId,
        output
      });
    });
  }

  /**
   * Handle task completion report from child
   */
  private handleReportTaskComplete(
    childId: string,
    command: ReportTaskCompleteCommand
  ): void {
    const ctx = this.contexts.get(childId);
    if (!ctx || !ctx.parentId) {
      console.warn(`No parent for child ${childId} to report completion to`);
      return;
    }

    const taskManager = getTaskManager();
    const task = taskManager.getTaskByChildId(childId);

    const result: TaskResult = {
      success: command.success,
      summary: command.summary,
      data: command.data,
      artifacts: command.artifacts,
      recommendations: command.recommendations
    };

    if (task) {
      taskManager.completeTask(task.taskId, result);
      this.emit('task-complete', ctx.parentId, childId, task);
    }

    // Notify the parent instance
    this.injectResponse(ctx.parentId, 'task_complete', true, {
      childId,
      taskId: task?.taskId,
      result,
      message: `Child ${childId} completed task: ${command.summary}`
    });
  }

  /**
   * Handle progress report from child
   */
  private handleReportProgress(
    childId: string,
    command: ReportProgressCommand
  ): void {
    const ctx = this.contexts.get(childId);
    if (!ctx || !ctx.parentId) {
      return;
    }

    const taskManager = getTaskManager();
    const progress: TaskProgress = {
      percentage: command.percentage,
      currentStep: command.currentStep,
      stepsRemaining: command.stepsRemaining
    };

    taskManager.updateProgress(childId, progress);
    this.emit('task-progress', ctx.parentId, childId, progress);

    // Optionally notify the parent (can be noisy, so only for significant progress)
    if (command.percentage % 25 === 0) {
      this.injectResponse(ctx.parentId, 'task_progress', true, {
        childId,
        progress
      });
    }
  }

  /**
   * Handle error report from child
   */
  private handleReportError(
    childId: string,
    command: ReportErrorCommand
  ): void {
    const ctx = this.contexts.get(childId);
    if (!ctx || !ctx.parentId) {
      return;
    }

    const taskManager = getTaskManager();
    const task = taskManager.getTaskByChildId(childId);

    const error: TaskError = {
      code: command.code,
      message: command.message,
      context: command.context,
      suggestedAction: command.suggestedAction
    };

    if (task) {
      taskManager.failTask(task.taskId, error);
    }

    this.emit('task-error', ctx.parentId, childId, error);

    // Notify the parent instance
    this.injectResponse(ctx.parentId, 'task_error', true, {
      childId,
      taskId: task?.taskId,
      error,
      message: `Child ${childId} reported error: ${command.message}`
    });
  }

  /**
   * Handle task status query
   */
  private handleGetTaskStatus(
    instanceId: string,
    command: GetTaskStatusCommand
  ): void {
    const ctx = this.contexts.get(instanceId);
    if (!ctx) return;

    const taskManager = getTaskManager();

    if (command.taskId) {
      // Get specific task
      const task = taskManager.getTask(command.taskId);
      this.injectResponse(instanceId, 'get_task_status', !!task, {
        task: task ? taskManager.serializeTask(task) : null
      });
    } else {
      // Get all tasks for this instance
      const tasks = ctx.parentId
        ? [] // Children don't have their own tasks
        : taskManager.getTasksByParentId(instanceId);

      this.injectResponse(instanceId, 'get_task_status', true, {
        tasks: tasks.map((t) => taskManager.serializeTask(t)),
        history: taskManager.getTaskHistory(instanceId)
      });
    }
  }

  /**
   * Handle user action request from Claude
   */
  private handleRequestUserAction(
    instanceId: string,
    command: RequestUserActionCommand
  ): void {
    const requestId = `uar-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const request: UserActionRequest = {
      id: requestId,
      instanceId,
      requestType: command.requestType,
      title: command.title,
      message: command.message,
      targetMode: command.targetMode,
      options: command.options,
      context: command.context,
      createdAt: Date.now()
    };

    // Store the pending request
    this.pendingUserActions.set(requestId, request);

    // Emit event for UI to display the request
    this.emit('user-action-request', request);

    // Send acknowledgment back to Claude that the request was sent
    this.injectResponse(instanceId, 'request_user_action', true, {
      requestId,
      status: 'pending',
      message: 'Request sent to user. Waiting for response...'
    });

    console.log(`Orchestrator: User action request ${requestId} created for instance ${instanceId}`);
  }

  /**
   * Respond to a pending user action request
   */
  respondToUserAction(
    requestId: string,
    approved: boolean,
    selectedOption?: string
  ): void {
    const request = this.pendingUserActions.get(requestId);
    if (!request) {
      console.warn(`No pending user action request found: ${requestId}`);
      return;
    }

    // Remove from pending
    this.pendingUserActions.delete(requestId);

    // Send response back to the instance
    this.injectResponse(request.instanceId, 'user_action_response', true, {
      requestId,
      approved,
      selectedOption,
      requestType: request.requestType,
      targetMode: request.targetMode
    });

    console.log(`Orchestrator: User action ${requestId} ${approved ? 'approved' : 'rejected'}`);
  }

  /**
   * Get all pending user action requests
   */
  getPendingUserActions(): UserActionRequest[] {
    return Array.from(this.pendingUserActions.values());
  }

  /**
   * Get pending user actions for a specific instance
   */
  getPendingUserActionsForInstance(instanceId: string): UserActionRequest[] {
    return Array.from(this.pendingUserActions.values()).filter(
      (r) => r.instanceId === instanceId
    );
  }

  /**
   * Send a response back to the instance
   */
  private injectResponse(
    instanceId: string,
    action: string,
    success: boolean,
    data: unknown
  ): void {
    const response = formatCommandResponse(action as any, success, data);
    this.emit('inject-response', instanceId, response);
  }

  /**
   * Notify parent about a successful child spawn
   */
  notifyChildSpawned(
    parentId: string,
    childId: string,
    childName: string,
    routing?: RoutingDecision
  ): void {
    this.addChild(parentId, childId);

    // Build response data with optional routing info
    const responseData: Record<string, unknown> = {
      childId,
      name: childName,
      message: 'Child instance created successfully'
    };

    // Include routing information if available
    if (routing) {
      responseData['routing'] = {
        model: routing.model,
        complexity: routing.complexity,
        tier: routing.tier,
        confidence: routing.confidence,
        estimatedSavingsPercent: routing.estimatedSavingsPercent
      };
    }

    this.injectResponse(parentId, 'spawn_child', true, responseData);
  }

  /**
   * Notify parent about a successful message delivery
   */
  notifyMessageSent(parentId: string, childId: string): void {
    this.injectResponse(parentId, 'message_child', true, {
      childId,
      message: 'Message delivered successfully'
    });
  }

  /**
   * Notify parent about a child termination
   */
  notifyChildTerminated(parentId: string, childId: string): void {
    const ctx = this.contexts.get(parentId);
    if (ctx) {
      ctx.childrenIds = ctx.childrenIds.filter((id) => id !== childId);
    }
    this.injectResponse(parentId, 'terminate_child', true, {
      childId,
      message: 'Child instance terminated'
    });
  }

  /**
   * Notify parent about a fast-path local retrieval result
   */
  notifyFastPathResult(
    parentId: string,
    payload: {
      summary: string;
      task: string;
      mode: 'grep' | 'files';
      command: string;
      args: string[];
      totalMatches: number;
      lines: string[];
      cwd: string;
    }
  ): void {
    this.injectResponse(parentId, 'task_complete', true, {
      childId: 'fast-path',
      result: {
        summary: payload.summary,
        data: {
          task: payload.task,
          mode: payload.mode,
          command: payload.command,
          args: payload.args,
          totalMatches: payload.totalMatches,
          lines: payload.lines,
          cwd: payload.cwd
        }
      },
      message: payload.summary
    });
  }

  /**
   * Notify an instance about an error
   */
  notifyError(instanceId: string, error: string): void {
    this.injectResponse(instanceId, 'error', false, {
      error,
      message: error
    });
  }

  // ============================================
  // Structured Result Handlers
  // ============================================

  /**
   * Handle report_result command from child
   */
  private handleReportResult(childId: string, command: ReportResultCommand): void {
    const ctx = this.contexts.get(childId);
    if (!ctx || !ctx.parentId) {
      console.warn(`No parent for child ${childId} to report result to`);
      return;
    }

    // Emit event for the orchestration manager to store the result
    this.emit(
      'report-result',
      childId,
      command,
      (response: ChildSummaryResponse | null) => {
        if (response) {
          // Notify parent with compact summary
          this.injectResponse(ctx.parentId!, 'child_result', true, {
            ...response,
            message: `Child ${childId} reported result: ${response.summary}`
          });
        }
      }
    );
  }

  /**
   * Handle get_child_summary command from parent
   */
  private handleGetChildSummary(
    parentId: string,
    command: GetChildSummaryCommand
  ): void {
    const ctx = this.contexts.get(parentId);
    if (!ctx) return;

    // Verify the child belongs to this parent
    if (!ctx.childrenIds.includes(command.childId)) {
      this.injectResponse(parentId, 'get_child_summary', false, {
        error: `Child ${command.childId} not found or not owned by you`
      });
      return;
    }

    this.emit(
      'get-child-summary',
      parentId,
      command,
      (response: ChildSummaryResponse | null) => {
        if (response) {
          this.injectResponse(parentId, 'get_child_summary', true, response);
        } else {
          // Fall back to checking if there's a stored result
          this.injectResponse(parentId, 'get_child_summary', false, {
            childId: command.childId,
            error: 'No structured result available. Child may not have completed yet or used report_task_complete instead.',
            suggestion: 'Use get_child_output to see raw output'
          });
        }
      }
    );
  }

  /**
   * Handle get_child_artifacts command from parent
   */
  private handleGetChildArtifacts(
    parentId: string,
    command: GetChildArtifactsCommand
  ): void {
    const ctx = this.contexts.get(parentId);
    if (!ctx) return;

    // Verify the child belongs to this parent
    if (!ctx.childrenIds.includes(command.childId)) {
      this.injectResponse(parentId, 'get_child_artifacts', false, {
        error: `Child ${command.childId} not found or not owned by you`
      });
      return;
    }

    this.emit(
      'get-child-artifacts',
      parentId,
      command,
      (response: ChildArtifactsResponse | null) => {
        if (response) {
          this.injectResponse(parentId, 'get_child_artifacts', true, response);
        } else {
          this.injectResponse(parentId, 'get_child_artifacts', false, {
            childId: command.childId,
            error: 'No artifacts available for this child'
          });
        }
      }
    );
  }

  /**
   * Handle get_child_section command from parent
   */
  private handleGetChildSection(
    parentId: string,
    command: GetChildSectionCommand
  ): void {
    const ctx = this.contexts.get(parentId);
    if (!ctx) return;

    // Verify the child belongs to this parent
    if (!ctx.childrenIds.includes(command.childId)) {
      this.injectResponse(parentId, 'get_child_section', false, {
        error: `Child ${command.childId} not found or not owned by you`
      });
      return;
    }

    this.emit(
      'get-child-section',
      parentId,
      command,
      (response: ChildSectionResponse | null) => {
        if (response) {
          // Warn if loading full transcript
          if (command.section === 'full' && response.tokenCount > 5000) {
            this.injectResponse(parentId, 'get_child_section', true, {
              ...response,
              warning: `Full transcript is ${response.tokenCount} tokens. Consider using get_child_summary or get_child_artifacts instead.`
            });
          } else {
            this.injectResponse(parentId, 'get_child_section', true, response);
          }
        } else {
          this.injectResponse(parentId, 'get_child_section', false, {
            childId: command.childId,
            section: command.section,
            error: 'Section not available'
          });
        }
      }
    );
  }
}
