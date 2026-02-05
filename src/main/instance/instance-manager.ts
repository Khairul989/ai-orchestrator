/**
 * Instance Manager - Coordinator for all Claude Code instances
 *
 * This is a thin coordinator that delegates to specialized managers:
 * - InstanceStateManager: State, adapters, batch updates
 * - InstanceLifecycleManager: Create, terminate, restart, mode changes
 * - InstanceCommunicationManager: Adapter events, message passing
 * - InstanceContextManager: RLM and unified memory context
 * - InstanceOrchestrationManager: Child spawning, fast-path retrieval
 * - InstancePersistenceManager: Session export, import, storage
 */

import { EventEmitter } from 'events';
import { generateChildPrompt } from '../orchestration/orchestration-protocol';
import { getSettingsManager } from '../core/config/settings-manager';
import { getTaskManager } from '../orchestration/task-manager';
import { getChildResultStorage } from '../orchestration/child-result-storage';
import type { RoutingDecision } from '../routing';
import type { SpawnChildCommand } from '../orchestration/orchestration-protocol';
import type {
  Instance,
  InstanceCreateConfig,
  ExportedSession,
  ForkConfig,
  OutputMessage
} from '../../shared/types/instance.types';
import { generateId } from '../../shared/utils/id-generator';

import { InstanceStateManager } from './instance-state';
import { InstanceLifecycleManager } from './instance-lifecycle';
import { InstanceCommunicationManager } from './instance-communication';
import { InstanceContextManager } from './instance-context';
import { InstanceOrchestrationManager } from './instance-orchestration';
import { InstancePersistenceManager } from './instance-persistence';

// Singleton instance
let instanceManager: InstanceManager | null = null;

export class InstanceManager extends EventEmitter {
  // Sub-managers
  private state: InstanceStateManager;
  private lifecycle: InstanceLifecycleManager;
  private communication: InstanceCommunicationManager;
  private context: InstanceContextManager;
  private orchestrationMgr: InstanceOrchestrationManager;
  private persistence: InstancePersistenceManager;

  // Tracking
  private hasReceivedFirstMessage = new Set<string>();
  private settings = getSettingsManager();

  constructor() {
    super();

    // Initialize sub-managers with dependencies
    this.state = new InstanceStateManager();
    this.context = new InstanceContextManager();

    // Communication manager needs dependencies
    this.communication = new InstanceCommunicationManager({
      getInstance: (id) => this.state.getInstance(id),
      getAdapter: (id) => this.state.getAdapter(id),
      setAdapter: (id, adapter) => this.state.setAdapter(id, adapter),
      deleteAdapter: (id) => this.state.deleteAdapter(id),
      queueUpdate: (id, status, ctx) => this.state.queueUpdate(id, status, ctx),
      processOrchestrationOutput: (id, content) => this.orchestrationMgr.processOrchestrationOutput(id, content),
      onInterruptedExit: (id) => this.lifecycle.respawnAfterInterrupt(id),
      ingestToRLM: (id, msg) => this.context.ingestToRLM(id, msg),
      ingestToUnifiedMemory: (inst, msg) => this.context.ingestToUnifiedMemory(inst, msg),
      compactContext: async (id) => {
        const instance = this.state.getInstance(id);
        if (instance) {
          await this.context.compactContext(id, instance);
        }
      },
      onChildExit: (childId, child, exitCode) => {
        this.handleChildExit(childId, child, exitCode);
      }
    });

    // Orchestration manager needs dependencies
    this.orchestrationMgr = new InstanceOrchestrationManager({
      getInstance: (id) => this.state.getInstance(id),
      getInstanceCount: () => this.state.getInstanceCount(),
      createChildInstance: (parentId, cmd, routing) => this.createChildInstance(parentId, cmd, routing),
      sendInput: (id, msg) => this.sendInput(id, msg),
      terminateInstance: (id, graceful) => this.terminateInstance(id, graceful),
      getAdapter: (id) => this.state.getAdapter(id)
    });

    // Lifecycle manager needs dependencies
    this.lifecycle = new InstanceLifecycleManager({
      getInstance: (id) => this.state.getInstance(id),
      setInstance: (inst) => this.state.setInstance(inst),
      deleteInstance: (id) => this.state.deleteInstance(id),
      getAdapter: (id) => this.state.getAdapter(id),
      setAdapter: (id, adapter) => this.state.setAdapter(id, adapter),
      deleteAdapter: (id) => this.state.deleteAdapter(id),
      getInstanceCount: () => this.state.getInstanceCount(),
      forEachInstance: (cb) => this.state.forEachInstance(cb),
      queueUpdate: (id, status, ctx) => this.state.queueUpdate(id, status, ctx),
      serializeForIpc: (inst) => this.state.serializeForIpc(inst),
      setupAdapterEvents: (id, adapter) => this.communication.setupAdapterEvents(id, adapter),
      initializeRlm: (inst) => this.context.initializeRlm(inst),
      endRlmSession: (id) => this.context.endRlmSession(id),
      ingestInitialOutputToRlm: (inst, msgs) => this.context.ingestInitialOutputToRlm(inst, msgs),
      registerOrchestration: (id, wd, pid) => this.orchestrationMgr.registerInstance(id, wd, pid),
      unregisterOrchestration: (id) => this.orchestrationMgr.unregisterInstance(id),
      markInterrupted: (id) => this.communication.markInterrupted(id),
      clearInterrupted: (id) => this.communication.clearInterrupted(id),
      addToOutputBuffer: (inst, msg) => this.communication.addToOutputBuffer(inst, msg),
      clearFirstMessageTracking: (id) => this.hasReceivedFirstMessage.delete(id),
      markFirstMessageReceived: (id) => this.hasReceivedFirstMessage.add(id)
    });

    // Persistence manager needs dependencies
    this.persistence = new InstancePersistenceManager({
      getInstance: (id) => this.state.getInstance(id),
      createInstance: (config) => this.createInstance(config)
    });

    // Set up event forwarding
    this.setupEventForwarding();

    // Set up orchestration handlers
    const settingsAll = this.settings.getAll();
    this.orchestrationMgr.setupOrchestrationHandlers(
      {
        maxTotalInstances: settingsAll.maxTotalInstances,
        maxChildrenPerParent: settingsAll.maxChildrenPerParent
      },
      (inst, msg) => this.communication.addToOutputBuffer(inst, msg),
      (event, payload) => this.emit(event, payload)
    );

    // Start periodic task timeout checking
    getTaskManager().startTimeoutChecker(15000, (timedOut) => {
      for (const task of timedOut) {
        console.warn(`[TaskManager] Task ${task.taskId} timed out (child: ${task.childId})`);
        const orchestration = this.orchestrationMgr.getOrchestrationHandler();
        orchestration.notifyError(
          task.parentId,
          `Child task "${task.task}" timed out after ${Math.round((task.timeout || 0) / 1000)}s`
        );
      }
    });

    // Listen for settings changes
    this.settings.on('setting-changed', () => {
      const newSettings = this.settings.getAll();
      this.orchestrationMgr.setupOrchestrationHandlers(
        {
          maxTotalInstances: newSettings.maxTotalInstances,
          maxChildrenPerParent: newSettings.maxChildrenPerParent
        },
        (inst, msg) => this.communication.addToOutputBuffer(inst, msg),
        (event, payload) => this.emit(event, payload)
      );
    });
  }

  // ============================================
  // Event Forwarding
  // ============================================

  private setupEventForwarding(): void {
    // State events
    this.state.on('batch-update', (payload) => this.emit('instance:batch-update', payload));

    // Communication events
    this.communication.on('output', (payload) => this.emit('instance:output', payload));
    this.communication.on('input-required', (payload) => {
      console.log('=== [InstanceManager] INPUT-REQUIRED EVENT RECEIVED ===');
      console.log('[InstanceManager] Payload:', JSON.stringify(payload, null, 2));
      this.emit('instance:input-required', payload);
      console.log('[InstanceManager] instance:input-required event emitted');
    });

    // Lifecycle events
    this.lifecycle.on('created', (payload) => this.emit('instance:created', payload));
    this.lifecycle.on('removed', (instanceId) => this.emit('instance:removed', instanceId));
    this.lifecycle.on('output', (payload) => this.emit('instance:output', payload));
    this.lifecycle.on('agent-changed', (payload) => this.emit('instance:agent-changed', payload));
    this.lifecycle.on('yolo-toggled', (payload) => this.emit('instance:yolo-toggled', payload));
    this.lifecycle.on('model-changed', (payload) => this.emit('instance:model-changed', payload));
    this.lifecycle.on('state-update', (payload) => this.emit('instance:state-update', payload));
    this.lifecycle.on('memory:warning', (stats) => this.emit('memory:warning', stats));
    this.lifecycle.on('memory:critical', (stats) => this.emit('memory:critical', stats));
    this.lifecycle.on('memory:stats', (stats) => this.emit('memory:stats', stats));
  }

  // ============================================
  // Public API - Instance Access
  // ============================================

  getInstance(id: string): Instance | undefined {
    return this.state.getInstance(id);
  }

  getAllInstances(): Instance[] {
    return this.state.getAllInstances();
  }

  getAllInstancesForIpc(): Record<string, unknown>[] {
    return this.state.getAllInstancesForIpc();
  }

  serializeForIpc(instance: Instance): Record<string, unknown> {
    return this.state.serializeForIpc(instance);
  }

  // ============================================
  // Public API - Instance Lifecycle
  // ============================================

  async createInstance(config: InstanceCreateConfig): Promise<Instance> {
    return this.lifecycle.createInstance(config);
  }

  async terminateInstance(instanceId: string, graceful = true): Promise<void> {
    return this.lifecycle.terminateInstance(instanceId, graceful);
  }

  async restartInstance(instanceId: string): Promise<void> {
    return this.lifecycle.restartInstance(instanceId);
  }

  async terminateAll(): Promise<void> {
    return this.lifecycle.terminateAll();
  }

  async terminateAllInstances(): Promise<void> {
    return this.lifecycle.terminateAll();
  }

  renameInstance(instanceId: string, displayName: string): void {
    return this.lifecycle.renameInstance(instanceId, displayName);
  }

  async changeAgentMode(instanceId: string, newAgentId: string): Promise<Instance> {
    return this.lifecycle.changeAgentMode(instanceId, newAgentId);
  }

  async toggleYoloMode(instanceId: string): Promise<Instance> {
    return this.lifecycle.toggleYoloMode(instanceId);
  }

  async changeModel(instanceId: string, newModel: string): Promise<Instance> {
    return this.lifecycle.changeModel(instanceId, newModel);
  }

  interruptInstance(instanceId: string): boolean {
    return this.lifecycle.interruptInstance(instanceId);
  }

  // ============================================
  // Public API - Communication
  // ============================================

  async sendInput(instanceId: string, message: string, attachments?: any[]): Promise<void> {
    const instance = this.state.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Update activity and request count
    instance.requestCount++;
    instance.lastActivity = Date.now();

    // Calculate context budget and build contexts
    const budgets = this.context.calculateContextBudget(instance, message);

    const [rlmContext, unifiedMemoryContext] = await Promise.all([
      this.context.buildRlmContext(instanceId, message, budgets.rlmMaxTokens, budgets.rlmTopK),
      this.context.buildUnifiedMemoryContext(instance, message, generateId(), budgets.unifiedMaxTokens)
    ]);

    if (rlmContext) {
      console.log(
        `[RLM] Injected context for instance ${instanceId}: ${rlmContext.tokens} tokens, ${rlmContext.sectionsAccessed.length} sections, ${rlmContext.durationMs}ms`
      );
    }

    if (unifiedMemoryContext) {
      console.log(
        `[UnifiedMemory] Injected context for instance ${instanceId}: ${unifiedMemoryContext.tokens} tokens, ${unifiedMemoryContext.longTermCount} long-term, ${unifiedMemoryContext.proceduralCount} procedural, ${unifiedMemoryContext.durationMs}ms`
      );
    }

    // Build metadata for user message
    const metadata: Record<string, unknown> = {};
    if (rlmContext) {
      metadata['rlmContext'] = {
        injected: true,
        tokens: rlmContext.tokens,
        sectionsAccessed: rlmContext.sectionsAccessed,
        durationMs: rlmContext.durationMs,
        source: rlmContext.source
      };
    }
    if (unifiedMemoryContext) {
      metadata['unifiedMemoryContext'] = {
        injected: true,
        tokens: unifiedMemoryContext.tokens,
        longTermCount: unifiedMemoryContext.longTermCount,
        proceduralCount: unifiedMemoryContext.proceduralCount,
        durationMs: unifiedMemoryContext.durationMs
      };
    }

    // Add user message to output buffer
    const userMessage = {
      id: generateId(),
      timestamp: Date.now(),
      type: 'user' as const,
      content: message,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      attachments: attachments?.map((a) => ({
        name: a.name,
        type: a.type,
        size: a.size,
        data: a.data
      }))
    };
    this.communication.addToOutputBuffer(instance, userMessage);
    this.emit('instance:output', { instanceId, message: userMessage });

    // Build context blocks
    const contextBlocks = [
      this.context.formatUnifiedMemoryContextBlock(unifiedMemoryContext),
      this.context.formatRlmContextBlock(rlmContext)
    ].filter(Boolean) as string[];
    let contextBlock = contextBlocks.length > 0 ? contextBlocks.join('\n\n') : null;

    // Prepend orchestration prompt to first message
    if (!this.hasReceivedFirstMessage.has(instanceId)) {
      this.hasReceivedFirstMessage.add(instanceId);
      const orchestrationPrompt = this.orchestrationMgr.getOrchestrationPrompt(instanceId, instance.currentModel);
      const prefix = contextBlock ? `${contextBlock}\n\n` : '';
      contextBlock = `${prefix}${orchestrationPrompt}\n\n---`;
    }

    await this.communication.sendInput(instanceId, message, attachments, contextBlock);
  }

  async sendInputResponse(instanceId: string, response: string, permissionKey?: string): Promise<void> {
    return this.communication.sendInputResponse(instanceId, response, permissionKey);
  }

  // ============================================
  // Public API - Plan Mode
  // ============================================

  enterPlanMode(instanceId: string): Instance {
    return this.lifecycle.enterPlanMode(instanceId);
  }

  exitPlanMode(instanceId: string, force = false): Instance {
    return this.lifecycle.exitPlanMode(instanceId, force);
  }

  approvePlan(instanceId: string, planContent?: string): Instance {
    return this.lifecycle.approvePlan(instanceId, planContent);
  }

  updatePlanContent(instanceId: string, planContent: string): Instance {
    return this.lifecycle.updatePlanContent(instanceId, planContent);
  }

  getPlanModeState(instanceId: string): { enabled: boolean; state: string; planContent?: string } {
    return this.lifecycle.getPlanModeState(instanceId);
  }

  // ============================================
  // Public API - Persistence
  // ============================================

  async forkInstance(config: ForkConfig): Promise<Instance> {
    return this.persistence.forkInstance(config);
  }

  exportSession(instanceId: string): ExportedSession {
    return this.persistence.exportSession(instanceId);
  }

  exportSessionMarkdown(instanceId: string): string {
    return this.persistence.exportSessionMarkdown(instanceId);
  }

  async importSession(session: ExportedSession, workingDirectory?: string): Promise<Instance> {
    return this.persistence.importSession(session, workingDirectory);
  }

  async loadHistoricalOutput(instanceId: string, limit?: number): Promise<OutputMessage[]> {
    return this.persistence.loadHistoricalOutput(instanceId, limit);
  }

  getInstanceStorageStats(instanceId: string) {
    return this.persistence.getInstanceStorageStats(instanceId);
  }

  // ============================================
  // Public API - Orchestration
  // ============================================

  getOrchestrationHandler() {
    return this.orchestrationMgr.getOrchestrationHandler();
  }

  // ============================================
  // Public API - Memory
  // ============================================

  getMemoryStats() {
    return this.lifecycle.getMemoryStats();
  }

  // ============================================
  // Internal - Child Instance Creation
  // ============================================

  private async createChildInstance(
    parentId: string,
    command: SpawnChildCommand,
    routingDecision: RoutingDecision
  ): Promise<Instance> {
    const parent = this.state.getInstance(parentId);
    if (!parent) {
      throw new Error(`Parent instance ${parentId} not found`);
    }

    const tempChildId = generateId();

    // Extract parent context
    const parentContextMessages = parent.outputBuffer
      .slice(-50)
      .filter((msg) => msg.type === 'assistant' || msg.type === 'user' || msg.type === 'tool_result')
      .map((msg) => {
        const prefix = msg.type === 'assistant' ? '[Assistant]' : msg.type === 'user' ? '[User]' : '[Tool Result]';
        const content = msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...[truncated]' : msg.content;
        return `${prefix} ${content}`;
      });
    const parentContext = parentContextMessages.length > 0 ? parentContextMessages.join('\n\n') : undefined;

    const childPrompt = generateChildPrompt(
      tempChildId,
      parentId,
      command.task,
      undefined,
      parentContext
    );

    const childAgentId = this.orchestrationMgr.resolveChildAgentId(command);

    // Resolve provider
    const commandProvider = command.provider === 'codex' ? 'openai' : command.provider;
    const resolvedProvider = commandProvider || parent.provider || 'auto';

    // Pass relevant parent output to child for RLM indexing
    const initialOutputForChild = parent.outputBuffer
      .slice(-100)
      .filter((msg) => msg.type === 'assistant' || msg.type === 'user' || msg.type === 'tool_result');

    const child = await this.createInstance({
      workingDirectory: command.workingDirectory || parent.workingDirectory,
      displayName: command.name || `Child of ${parent.displayName}`,
      parentId: parentId,
      initialPrompt: childPrompt,
      yoloMode: command.yoloMode === true,
      agentId: childAgentId,
      modelOverride: routingDecision.model,
      provider: resolvedProvider,
      initialOutputBuffer: initialOutputForChild
    });

    // Mark this child as already having received its first message
    this.hasReceivedFirstMessage.add(child.id);

    return child;
  }

  // ============================================
  // Child Exit Handling
  // ============================================

  /**
   * Handle a child instance exiting - notify parent, capture results, clean up tasks.
   * This fixes the issue where children could exit without the parent ever knowing.
   */
  private handleChildExit(childId: string, child: Instance, exitCode: number | null): void {
    if (!child.parentId) return;

    const orchestration = this.orchestrationMgr.getOrchestrationHandler();
    const taskManager = getTaskManager();
    const storage = getChildResultStorage();

    // 1. Auto-capture result from output buffer if child didn't report one itself
    if (!storage.hasResult(childId) && child.outputBuffer.length > 0) {
      const task = taskManager.getTaskByChildId(childId);
      const lastAssistant = [...child.outputBuffer]
        .reverse()
        .find(m => m.type === 'assistant');
      const summary = lastAssistant
        ? lastAssistant.content.substring(0, 500)
        : 'Child exited without reporting a result.';
      const success = exitCode === 0;

      storage.storeFromOutputBuffer(
        childId,
        child.parentId,
        task?.task || child.displayName,
        summary,
        success,
        child.outputBuffer,
        child.createdAt
      ).catch(err => {
        console.error(`[ChildExit] Failed to auto-capture result for ${childId}:`, err);
      });
    }

    // 2. Clean up tasks in TaskManager
    taskManager.cleanupChildTasks(childId);

    // 3. Notify the parent that this child has exited
    orchestration.notifyChildTerminated(child.parentId, childId);

    console.log(
      `[ChildExit] Child ${childId} exited (code=${exitCode}), parent ${child.parentId} notified, task cleaned up`
    );
  }

  // ============================================
  // Cleanup
  // ============================================

  destroy(): void {
    getTaskManager().stopTimeoutChecker();
    this.state.destroy();
    this.lifecycle.destroy();
    this.terminateAll();
  }
}

// ============================================
// Singleton Accessor
// ============================================

export function getInstanceManager(): InstanceManager {
  if (!instanceManager) {
    instanceManager = new InstanceManager();
  }
  return instanceManager;
}
