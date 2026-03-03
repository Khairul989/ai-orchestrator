/**
 * Cross-Instance Communication Service
 *
 * Manages bidirectional communication bridges between instances,
 * allowing them to exchange messages and subscribe to bridge events.
 */

import { EventEmitter } from 'events';
import { getLogger } from '../logging/logger';

const logger = getLogger('CrossInstanceComm');

export interface CommBridge {
  id: string;
  name: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  createdAt: number;
  messageCount: number;
}

export interface CommMessage {
  id: string;
  bridgeId: string;
  fromInstanceId: string;
  toInstanceId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class CrossInstanceCommService extends EventEmitter {
  private static instance: CrossInstanceCommService;

  private bridges = new Map<string, CommBridge>();
  private messages = new Map<string, CommMessage[]>(); // bridgeId -> messages
  private subscriptions = new Map<string, Set<string>>(); // instanceId -> bridgeIds

  static getInstance(): CrossInstanceCommService {
    if (!this.instance) {
      this.instance = new CrossInstanceCommService();
    }
    return this.instance;
  }

  static _resetForTesting(): void {
    if (this.instance) {
      this.instance.removeAllListeners();
      (this.instance as unknown) = undefined;
    }
  }

  private constructor() {
    super();
  }

  /**
   * Creates a bidirectional communication bridge between two instances.
   */
  createBridge(name: string, sourceInstanceId: string, targetInstanceId: string): CommBridge {
    const id = crypto.randomUUID();
    const bridge: CommBridge = {
      id,
      name,
      sourceInstanceId,
      targetInstanceId,
      createdAt: Date.now(),
      messageCount: 0,
    };

    this.bridges.set(id, bridge);
    this.messages.set(id, []);

    logger.info('Bridge created', { bridgeId: id, name, sourceInstanceId, targetInstanceId });
    this.emit('bridge:created', bridge);

    return bridge;
  }

  /**
   * Removes a bridge and all of its messages.
   * Also removes the bridge from any subscriptions.
   */
  deleteBridge(bridgeId: string): boolean {
    if (!this.bridges.has(bridgeId)) {
      logger.warn('Attempted to delete non-existent bridge', { bridgeId });
      return false;
    }

    this.bridges.delete(bridgeId);
    this.messages.delete(bridgeId);

    // Remove bridge from all instance subscriptions
    for (const [instanceId, bridgeIds] of this.subscriptions) {
      if (bridgeIds.has(bridgeId)) {
        bridgeIds.delete(bridgeId);
        if (bridgeIds.size === 0) {
          this.subscriptions.delete(instanceId);
        }
      }
    }

    logger.info('Bridge deleted', { bridgeId });
    this.emit('bridge:deleted', { bridgeId });

    return true;
  }

  /**
   * Returns all bridges.
   */
  getBridges(): CommBridge[] {
    return Array.from(this.bridges.values());
  }

  /**
   * Returns bridges where the given instance is either the source or target.
   */
  getBridgesForInstance(instanceId: string): CommBridge[] {
    return Array.from(this.bridges.values()).filter(
      (bridge) =>
        bridge.sourceInstanceId === instanceId || bridge.targetInstanceId === instanceId
    );
  }

  /**
   * Creates a message on a bridge, emits a 'message' event, and returns the message.
   * Validates that the bridge exists and that fromInstanceId is a participant.
   */
  sendMessage(
    bridgeId: string,
    fromInstanceId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): CommMessage {
    const bridge = this.bridges.get(bridgeId);
    if (!bridge) {
      throw new Error(`Bridge not found: ${bridgeId}`);
    }

    if (
      bridge.sourceInstanceId !== fromInstanceId &&
      bridge.targetInstanceId !== fromInstanceId
    ) {
      throw new Error(
        `Instance ${fromInstanceId} is not a participant of bridge ${bridgeId}`
      );
    }

    const toInstanceId =
      bridge.sourceInstanceId === fromInstanceId
        ? bridge.targetInstanceId
        : bridge.sourceInstanceId;

    const message: CommMessage = {
      id: crypto.randomUUID(),
      bridgeId,
      fromInstanceId,
      toInstanceId,
      content,
      timestamp: Date.now(),
      metadata,
    };

    const bridgeMessages = this.messages.get(bridgeId)!;
    bridgeMessages.push(message);

    bridge.messageCount += 1;

    logger.info('Message sent', {
      messageId: message.id,
      bridgeId,
      fromInstanceId,
      toInstanceId,
    });
    this.emit('message', message);

    return message;
  }

  /**
   * Returns messages for a bridge, most-recent-last. Optionally limited to the
   * last `limit` messages.
   */
  getMessages(bridgeId: string, limit?: number): CommMessage[] {
    const bridgeMessages = this.messages.get(bridgeId);
    if (!bridgeMessages) {
      return [];
    }

    if (limit !== undefined && limit > 0) {
      return bridgeMessages.slice(-limit);
    }

    return [...bridgeMessages];
  }

  /**
   * Subscribes an instance to a bridge's messages.
   * Returns false if the bridge does not exist.
   */
  subscribe(instanceId: string, bridgeId: string): boolean {
    if (!this.bridges.has(bridgeId)) {
      logger.warn('Attempted to subscribe to non-existent bridge', { instanceId, bridgeId });
      return false;
    }

    if (!this.subscriptions.has(instanceId)) {
      this.subscriptions.set(instanceId, new Set());
    }

    this.subscriptions.get(instanceId)!.add(bridgeId);

    logger.info('Instance subscribed to bridge', { instanceId, bridgeId });

    return true;
  }

  /**
   * Returns the bridge IDs an instance is subscribed to.
   */
  getSubscriptions(instanceId: string): string[] {
    const bridgeIds = this.subscriptions.get(instanceId);
    if (!bridgeIds) {
      return [];
    }
    return Array.from(bridgeIds);
  }

  /**
   * Clears all bridges, messages, and subscriptions.
   */
  cleanup(): void {
    this.bridges.clear();
    this.messages.clear();
    this.subscriptions.clear();
    logger.info('CrossInstanceCommService cleaned up');
  }
}

export function getCrossInstanceComm(): CrossInstanceCommService {
  return CrossInstanceCommService.getInstance();
}
