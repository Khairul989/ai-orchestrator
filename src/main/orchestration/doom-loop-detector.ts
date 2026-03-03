/**
 * DoomLoopDetector - Detects when an AI agent repeatedly makes the same tool call.
 * Inspired by opencode's doom-loop detection pattern.
 */

import { EventEmitter } from 'events';
import { getLogger } from '../logging/logger';

const logger = getLogger('DoomLoopDetector');

const DOOM_LOOP_THRESHOLD = 3;
const MAX_HISTORY_PER_INSTANCE = 10;

interface ToolInvocation {
  toolName: string;
  inputHash: string; // JSON.stringify of input
  timestamp: number;
}

export interface DoomLoopEvent {
  instanceId: string;
  toolName: string;
  input: unknown;
  consecutiveCount: number;
}

export class DoomLoopDetector extends EventEmitter {
  private static instance: DoomLoopDetector | null = null;

  private history = new Map<string, ToolInvocation[]>();

  static getInstance(): DoomLoopDetector {
    if (!this.instance) {
      this.instance = new DoomLoopDetector();
    }
    return this.instance;
  }

  static _resetForTesting(): void {
    if (this.instance) {
      this.instance.history.clear();
      this.instance.removeAllListeners();
      this.instance = null;
    }
  }

  private constructor() {
    super();
  }

  /**
   * Records a tool invocation and returns a DoomLoopEvent if a doom loop is
   * detected (last N consecutive identical calls), or null if no loop.
   */
  recordToolCall(instanceId: string, toolName: string, input: unknown): DoomLoopEvent | null {
    const inputHash = JSON.stringify(input);
    const invocation: ToolInvocation = { toolName, inputHash, timestamp: Date.now() };

    const invocations = this.history.get(instanceId) ?? [];

    // Append the new invocation and trim to the circular buffer size.
    invocations.push(invocation);
    if (invocations.length > MAX_HISTORY_PER_INSTANCE) {
      invocations.splice(0, invocations.length - MAX_HISTORY_PER_INSTANCE);
    }
    this.history.set(instanceId, invocations);

    // Count consecutive identical calls at the tail of the buffer.
    const consecutiveCount = this.countConsecutiveIdentical(invocations);

    if (consecutiveCount >= DOOM_LOOP_THRESHOLD) {
      const event: DoomLoopEvent = { instanceId, toolName, input, consecutiveCount };

      logger.warn('Doom loop detected', {
        instanceId,
        toolName,
        consecutiveCount,
        inputHash,
      });

      this.emit('doom-loop-detected', event);
      return event;
    }

    return null;
  }

  /**
   * Returns the current consecutive identical call count for the instance.
   */
  getLoopCount(instanceId: string): number {
    const invocations = this.history.get(instanceId);
    if (!invocations || invocations.length === 0) {
      return 0;
    }
    return this.countConsecutiveIdentical(invocations);
  }

  /**
   * Clears tracking for an instance (resets its history without removing the key).
   */
  reset(instanceId: string): void {
    const invocations = this.history.get(instanceId);
    if (invocations) {
      invocations.length = 0;
      logger.debug('Doom loop tracking reset', { instanceId });
    }
  }

  /**
   * Removes all tracking for a terminated instance.
   */
  cleanupInstance(instanceId: string): void {
    this.history.delete(instanceId);
    logger.debug('Doom loop tracking cleaned up', { instanceId });
  }

  // ============ Private helpers ============

  private countConsecutiveIdentical(invocations: ToolInvocation[]): number {
    if (invocations.length === 0) {
      return 0;
    }

    const last = invocations[invocations.length - 1];
    let count = 0;

    for (let i = invocations.length - 1; i >= 0; i--) {
      const current = invocations[i];
      if (current.toolName === last.toolName && current.inputHash === last.inputHash) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }
}

export function getDoomLoopDetector(): DoomLoopDetector {
  return DoomLoopDetector.getInstance();
}
