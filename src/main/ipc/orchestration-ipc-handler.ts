/**
 * Orchestration IPC Handlers - Phase 6 features
 * Handles workflows, review agents, hooks, and skills
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, IpcResponse } from '../../shared/types/ipc.types';
import type { InstanceManager } from '../instance/instance-manager';
import type {
  WorkflowGetTemplatePayload,
  WorkflowStartPayload,
  WorkflowGetExecutionPayload,
  WorkflowGetByInstancePayload,
  WorkflowCompletePhasePayload,
  WorkflowSatisfyGatePayload,
  WorkflowSkipPhasePayload,
  WorkflowCancelPayload,
  WorkflowGetPromptAdditionPayload,
  ReviewGetAgentPayload,
  ReviewStartSessionPayload,
  ReviewGetSessionPayload,
  ReviewGetIssuesPayload,
  ReviewAcknowledgeIssuePayload,
  HooksListPayload,
  HooksGetPayload,
  HooksCreatePayload,
  HooksUpdatePayload,
  HooksDeletePayload,
  HooksEvaluatePayload,
  HooksImportPayload,
  HooksExportPayload,
  HookApprovalsListPayload,
  HookApprovalsUpdatePayload,
  HookApprovalsClearPayload,
  SkillsDiscoverPayload,
  SkillsGetPayload,
  SkillsLoadPayload,
  SkillsUnloadPayload,
  SkillsLoadReferencePayload,
  SkillsLoadExamplePayload,
  SkillsMatchPayload
} from '../../shared/types/ipc.types';
import type { ReviewAgentConfig } from '../../shared/types/review-agent.types';
import { getWorkflowManager } from '../workflows/workflow-manager';
import { getHookEngine } from '../hooks/hook-engine';
import { getHookManager } from '../hooks/hook-manager';
import { getSkillRegistry } from '../skills/skill-registry';
import {
  builtInReviewAgents,
  getReviewAgentById
} from '../agents/review-agents';
import { getReviewCoordinator } from '../agents/review-coordinator';
import {
  HookEvent,
  HookContext,
  HookRule
} from '../../shared/types/hook.types';
import { serializeLoadedSkill } from '../../shared/types/skill.types';

export function registerOrchestrationHandlers(instanceManager: InstanceManager): void {
  // ============================================
  // Workflow Handlers (6.1)
  // ============================================

  // List all workflow templates
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_LIST_TEMPLATES,
    async (): Promise<IpcResponse> => {
      try {
        const templates = getWorkflowManager().listTemplates();
        return { success: true, data: templates };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get a specific workflow template
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_GET_TEMPLATE,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowGetTemplatePayload
    ): Promise<IpcResponse> => {
      try {
        const template = getWorkflowManager().getTemplate(payload.templateId);
        if (!template) {
          return {
            success: false,
            error: {
              code: 'WORKFLOW_TEMPLATE_NOT_FOUND',
              message: `Template not found: ${payload.templateId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: template };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_GET_TEMPLATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Start a workflow
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_START,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowStartPayload
    ): Promise<IpcResponse> => {
      try {
        const execution = getWorkflowManager().startWorkflow(
          payload.instanceId,
          payload.templateId
        );
        return { success: true, data: execution };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_START_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get workflow execution
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_GET_EXECUTION,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowGetExecutionPayload
    ): Promise<IpcResponse> => {
      try {
        const execution = getWorkflowManager().getExecution(
          payload.executionId
        );
        if (!execution) {
          return {
            success: false,
            error: {
              code: 'WORKFLOW_EXECUTION_NOT_FOUND',
              message: `Execution not found: ${payload.executionId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: execution };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_GET_EXECUTION_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get workflow execution by instance
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_GET_BY_INSTANCE,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowGetByInstancePayload
    ): Promise<IpcResponse> => {
      try {
        const execution = getWorkflowManager().getExecutionByInstance(
          payload.instanceId
        );
        return { success: true, data: execution || null };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_GET_BY_INSTANCE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Complete a phase
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_COMPLETE_PHASE,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowCompletePhasePayload
    ): Promise<IpcResponse> => {
      try {
        const execution = await getWorkflowManager().completePhase(
          payload.executionId,
          payload.phaseData
        );
        return { success: true, data: execution };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_COMPLETE_PHASE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Satisfy a gate
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_SATISFY_GATE,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowSatisfyGatePayload
    ): Promise<IpcResponse> => {
      try {
        const execution = getWorkflowManager().satisfyGate(
          payload.executionId,
          payload.response
        );
        return { success: true, data: execution };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_SATISFY_GATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Skip a phase
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_SKIP_PHASE,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowSkipPhasePayload
    ): Promise<IpcResponse> => {
      try {
        const execution = getWorkflowManager().skipPhase(payload.executionId);
        return { success: true, data: execution };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_SKIP_PHASE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Cancel a workflow
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_CANCEL,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowCancelPayload
    ): Promise<IpcResponse> => {
      try {
        getWorkflowManager().cancelWorkflow(payload.executionId);
        return { success: true, data: null };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_CANCEL_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get system prompt addition for current phase
  ipcMain.handle(
    IPC_CHANNELS.WORKFLOW_GET_PROMPT_ADDITION,
    async (
      event: IpcMainInvokeEvent,
      payload: WorkflowGetPromptAdditionPayload
    ): Promise<IpcResponse> => {
      try {
        const addition = getWorkflowManager().getSystemPromptAddition(
          payload.executionId
        );
        return { success: true, data: addition };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_GET_PROMPT_ADDITION_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // ============================================
  // Review Agent Handlers (6.2)
  // ============================================

  // List all review agents
  ipcMain.handle(
    IPC_CHANNELS.REVIEW_LIST_AGENTS,
    async (): Promise<IpcResponse> => {
      try {
        return { success: true, data: builtInReviewAgents };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REVIEW_LIST_AGENTS_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get a specific review agent
  ipcMain.handle(
    IPC_CHANNELS.REVIEW_GET_AGENT,
    async (
      event: IpcMainInvokeEvent,
      payload: ReviewGetAgentPayload
    ): Promise<IpcResponse> => {
      try {
        const agent = getReviewAgentById(payload.agentId);
        if (!agent) {
          return {
            success: false,
            error: {
              code: 'REVIEW_AGENT_NOT_FOUND',
              message: `Agent not found: ${payload.agentId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: agent };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REVIEW_GET_AGENT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Start a review session (runs agents and aggregates results)
  ipcMain.handle(
    IPC_CHANNELS.REVIEW_START_SESSION,
    async (
      _event: IpcMainInvokeEvent,
      payload: ReviewStartSessionPayload
    ): Promise<IpcResponse> => {
      try {
        const instance = instanceManager.getInstance(payload.instanceId);
        if (!instance) {
          return {
            success: false,
            error: {
              code: 'REVIEW_INSTANCE_NOT_FOUND',
              message: `Instance not found: ${payload.instanceId}`,
              timestamp: Date.now()
            }
          };
        }

        const agents = payload.agentIds
          .map((id) => getReviewAgentById(id))
          .filter(Boolean) as ReviewAgentConfig[];
        if (agents.length !== payload.agentIds.length) {
          const missing = payload.agentIds.filter((id) => !getReviewAgentById(id));
          return {
            success: false,
            error: {
              code: 'REVIEW_AGENT_NOT_FOUND',
              message: `Unknown review agent(s): ${missing.join(', ')}`,
              timestamp: Date.now()
            }
          };
        }

        const coordinator = getReviewCoordinator();
        const sessionId = await coordinator.startReview(payload.files || [], agents, {
          parallel: true,
          confidenceThreshold: 0,
          instanceId: payload.instanceId,
          workingDirectory: instance.workingDirectory,
          diffOnly: Boolean(payload.diffOnly),
        });

        return { success: true, data: { sessionId } };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REVIEW_START_SESSION_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get review session status/summary
  ipcMain.handle(
    IPC_CHANNELS.REVIEW_GET_SESSION,
    async (
      _event: IpcMainInvokeEvent,
      payload: ReviewGetSessionPayload
    ): Promise<IpcResponse> => {
      try {
        const session = getReviewCoordinator().getReview(payload.sessionId);
        if (!session) {
          return {
            success: false,
            error: {
              code: 'REVIEW_SESSION_NOT_FOUND',
              message: `Session not found: ${payload.sessionId}`,
              timestamp: Date.now()
            }
          };
        }
        // IPC-friendly serialization (Map -> Array).
        const serialized = {
          ...session,
          results: Array.from(session.results.values())
        };
        return { success: true, data: serialized };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REVIEW_GET_SESSION_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get issues for a review session
  ipcMain.handle(
    IPC_CHANNELS.REVIEW_GET_ISSUES,
    async (
      _event: IpcMainInvokeEvent,
      payload: ReviewGetIssuesPayload
    ): Promise<IpcResponse> => {
      try {
        const issues = getReviewCoordinator().getIssuesByAgent(
          payload.sessionId,
          payload.agentId,
          payload.severity
        );
        return { success: true, data: issues };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REVIEW_GET_ISSUES_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Acknowledge an issue (toggle)
  ipcMain.handle(
    IPC_CHANNELS.REVIEW_ACKNOWLEDGE_ISSUE,
    async (
      _event: IpcMainInvokeEvent,
      payload: ReviewAcknowledgeIssuePayload
    ): Promise<IpcResponse> => {
      try {
        const updated = getReviewCoordinator().acknowledgeIssue(
          payload.sessionId,
          payload.issueId,
          payload.acknowledged
        );
        if (!updated) {
          return {
            success: false,
            error: {
              code: 'REVIEW_ISSUE_NOT_FOUND',
              message: `Issue not found: ${payload.issueId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: updated };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'REVIEW_ACKNOWLEDGE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // ============================================
  // Hook Handlers (6.3)
  // ============================================

  // List hooks
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_LIST,
    async (
      event: IpcMainInvokeEvent,
      payload?: HooksListPayload
    ): Promise<IpcResponse> => {
      try {
        const hookEngine = getHookEngine();
        let rules = hookEngine.getAllRules();

        // Filter by event
        if (payload?.event) {
          rules = rules.filter(
            (r) => r.event === payload.event || r.event === 'all'
          );
        }

        // Filter by source
        if (payload?.source) {
          rules = rules.filter((r) => r.source === payload.source);
        }

        return { success: true, data: rules };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // List hook approvals
  ipcMain.handle(
    IPC_CHANNELS.HOOK_APPROVALS_LIST,
    async (
      event: IpcMainInvokeEvent,
      payload?: HookApprovalsListPayload
    ): Promise<IpcResponse> => {
      try {
        const hookManager = getHookManager();
        const hooks = hookManager.getAllHooks();

        const approvals = hooks
          .filter((hook) => hook.approvalRequired)
          .filter((hook) => (payload?.pendingOnly ? !hook.approved : true))
          .map((hook) => {
            const handlerType = hook.handler.type;
            let handlerSummary: string | undefined;
            if (handlerType === 'command') {
              handlerSummary = hook.handler.command;
            } else if (handlerType === 'prompt') {
              handlerSummary = hook.handler.prompt;
            }

            return {
              id: hook.id,
              name: hook.name,
              event: hook.event,
              enabled: hook.enabled,
              approvalRequired: Boolean(hook.approvalRequired),
              approved: Boolean(hook.approved),
              handlerType,
              handlerSummary
            };
          });

        return { success: true, data: approvals };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOK_APPROVALS_LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Update hook approval
  ipcMain.handle(
    IPC_CHANNELS.HOOK_APPROVALS_UPDATE,
    async (
      event: IpcMainInvokeEvent,
      payload: HookApprovalsUpdatePayload
    ): Promise<IpcResponse> => {
      try {
        const hookManager = getHookManager();
        const updated = hookManager.approveHook(
          payload.hookId,
          payload.approved
        );
        if (!updated) {
          return {
            success: false,
            error: {
              code: 'HOOK_APPROVAL_NOT_FOUND',
              message: `Hook not found: ${payload.hookId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: updated };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOK_APPROVAL_UPDATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Clear hook approvals
  ipcMain.handle(
    IPC_CHANNELS.HOOK_APPROVALS_CLEAR,
    async (
      event: IpcMainInvokeEvent,
      payload?: HookApprovalsClearPayload
    ): Promise<IpcResponse> => {
      try {
        const hookManager = getHookManager();
        const hookIds = payload?.hookIds
          ? payload.hookIds
          : hookManager
              .getAllHooks()
              .filter((hook) => hook.approvalRequired)
              .map((hook) => hook.id);

        let cleared = 0;
        for (const hookId of hookIds) {
          const updated = hookManager.approveHook(hookId, false);
          if (updated) {
            cleared += 1;
          }
        }

        return { success: true, data: { cleared } };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOK_APPROVALS_CLEAR_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get a specific hook
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_GET,
    async (
      event: IpcMainInvokeEvent,
      payload: HooksGetPayload
    ): Promise<IpcResponse> => {
      try {
        const rule = getHookEngine().getRule(payload.ruleId);
        if (!rule) {
          return {
            success: false,
            error: {
              code: 'HOOK_NOT_FOUND',
              message: `Hook not found: ${payload.ruleId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: rule };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_GET_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Create a hook
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_CREATE,
    async (
      event: IpcMainInvokeEvent,
      payload: HooksCreatePayload
    ): Promise<IpcResponse> => {
      try {
        const rule: HookRule = {
          id: `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...payload.rule,
          event: payload.rule.event as HookEvent | 'all',
          conditions: payload.rule.conditions.map((c) => ({
            field: c.field,
            operator: c.operator as
              | 'regex_match'
              | 'contains'
              | 'not_contains'
              | 'equals'
              | 'starts_with'
              | 'ends_with',
            pattern: c.pattern
          })),
          source: 'user',
          createdAt: Date.now()
        };

        getHookEngine().registerRule(rule);
        return { success: true, data: rule };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_CREATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Update a hook
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_UPDATE,
    async (
      event: IpcMainInvokeEvent,
      payload: HooksUpdatePayload
    ): Promise<IpcResponse> => {
      try {
        // Transform the payload updates to match HookRule types
        const updates: Partial<HookRule> = {
          ...payload.updates,
          conditions: payload.updates.conditions?.map((c) => ({
            field: c.field,
            operator: c.operator as
              | 'regex_match'
              | 'contains'
              | 'not_contains'
              | 'equals'
              | 'starts_with'
              | 'ends_with',
            pattern: c.pattern
          }))
        };
        const updated = getHookEngine().updateRule(payload.ruleId, updates);
        if (!updated) {
          return {
            success: false,
            error: {
              code: 'HOOK_NOT_FOUND',
              message: `Hook not found: ${payload.ruleId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: updated };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_UPDATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Delete a hook
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_DELETE,
    async (
      event: IpcMainInvokeEvent,
      payload: HooksDeletePayload
    ): Promise<IpcResponse> => {
      try {
        const deleted = getHookEngine().removeRule(payload.ruleId);
        return { success: true, data: deleted };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_DELETE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Evaluate hooks for a context
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_EVALUATE,
    async (
      event: IpcMainInvokeEvent,
      payload: HooksEvaluatePayload
    ): Promise<IpcResponse> => {
      try {
        const context: HookContext = {
          ...payload.context,
          event: payload.context.event as HookEvent
        };
        const result = getHookEngine().evaluate(context);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_EVALUATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Import hooks
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_IMPORT,
    async (
      event: IpcMainInvokeEvent,
      payload: HooksImportPayload
    ): Promise<IpcResponse> => {
      try {
        const result = getHookEngine().importRules(
          payload.rules as HookRule[],
          payload.overwrite
        );
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_IMPORT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Export hooks
  ipcMain.handle(
    IPC_CHANNELS.HOOKS_EXPORT,
    async (
      event: IpcMainInvokeEvent,
      payload?: HooksExportPayload
    ): Promise<IpcResponse> => {
      try {
        const rules = getHookEngine().exportRules(payload?.source);
        return { success: true, data: rules };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'HOOKS_EXPORT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // ============================================
  // Skill Handlers (6.4)
  // ============================================

  // Discover skills
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_DISCOVER,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsDiscoverPayload
    ): Promise<IpcResponse> => {
      try {
        const skills = await getSkillRegistry().discoverSkills(
          payload.searchPaths
        );
        return { success: true, data: skills };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_DISCOVER_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // List skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST, async (): Promise<IpcResponse> => {
    try {
      const skills = getSkillRegistry().listSkills();
      return { success: true, data: skills };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SKILLS_LIST_FAILED',
          message: (error as Error).message,
          timestamp: Date.now()
        }
      };
    }
  });

  // Get a specific skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_GET,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsGetPayload
    ): Promise<IpcResponse> => {
      try {
        const skill = getSkillRegistry().getSkill(payload.skillId);
        if (!skill) {
          return {
            success: false,
            error: {
              code: 'SKILL_NOT_FOUND',
              message: `Skill not found: ${payload.skillId}`,
              timestamp: Date.now()
            }
          };
        }
        return { success: true, data: skill };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_GET_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Load a skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_LOAD,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsLoadPayload
    ): Promise<IpcResponse> => {
      try {
        const loaded = await getSkillRegistry().loadSkill(payload.skillId);
        return { success: true, data: serializeLoadedSkill(loaded) };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_LOAD_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Unload a skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_UNLOAD,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsUnloadPayload
    ): Promise<IpcResponse> => {
      try {
        getSkillRegistry().unloadSkill(payload.skillId);
        return { success: true, data: null };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_UNLOAD_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Load a skill reference
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_LOAD_REFERENCE,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsLoadReferencePayload
    ): Promise<IpcResponse> => {
      try {
        const content = await getSkillRegistry().loadReference(
          payload.skillId,
          payload.referencePath
        );
        return { success: true, data: content };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_LOAD_REFERENCE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Load a skill example
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_LOAD_EXAMPLE,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsLoadExamplePayload
    ): Promise<IpcResponse> => {
      try {
        const content = await getSkillRegistry().loadExample(
          payload.skillId,
          payload.examplePath
        );
        return { success: true, data: content };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_LOAD_EXAMPLE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Match skills for text
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_MATCH,
    async (
      event: IpcMainInvokeEvent,
      payload: SkillsMatchPayload
    ): Promise<IpcResponse> => {
      try {
        const matches = getSkillRegistry().matchTrigger(payload.text);
        return { success: true, data: matches };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_MATCH_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );

  // Get skill memory usage
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_GET_MEMORY,
    async (): Promise<IpcResponse> => {
      try {
        const memory = getSkillRegistry().getMemoryUsage();
        return { success: true, data: memory };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SKILLS_GET_MEMORY_FAILED',
            message: (error as Error).message,
            timestamp: Date.now()
          }
        };
      }
    }
  );
}
