/**
 * Instance Output Store - Manages output buffering and throttling
 *
 * Handles high-frequency output messages with throttling to prevent UI thrashing.
 */

import { Injectable, inject, NgZone } from '@angular/core';
import { InstanceStateService } from './instance-state.service';
import type { OutputMessage } from './instance.types';
import { LIMITS } from '../../../../../shared/constants/limits';

@Injectable({ providedIn: 'root' })
export class InstanceOutputStore {
  private stateService = inject(InstanceStateService);
  private ngZone = inject(NgZone);

  // ============================================
  // Output Throttling
  // ============================================

  /**
   * Queue output message with throttling (100ms batches)
   */
  queueOutput(instanceId: string, message: OutputMessage): void {
    // Filter out empty messages (defense-in-depth)
    if (!this.hasContent(message)) {
      console.warn(
        `[InstanceOutputStore] Dropped empty ${message.type} message for instance ${instanceId}`,
        { id: message.id, contentLength: message.content?.length ?? 0 }
      );
      return;
    }

    const { outputThrottleTimers, pendingOutputMessages } = this.stateService;

    // Add to pending messages
    const pending = pendingOutputMessages.get(instanceId) || [];
    pending.push(message);
    pendingOutputMessages.set(instanceId, pending);

    // If no timer exists, start one
    if (!outputThrottleTimers.has(instanceId)) {
      const timer = setTimeout(() => {
        // Run inside NgZone to trigger Angular change detection
        this.ngZone.run(() => {
          this.flushOutput(instanceId);
        });
      }, LIMITS.TEXT_THROTTLE_MS);
      outputThrottleTimers.set(instanceId, timer);
    }
  }

  /**
   * Flush pending output messages for an instance
   * Handles streaming messages by updating existing messages with the same ID
   */
  flushOutput(instanceId: string): void {
    const { outputThrottleTimers, pendingOutputMessages } = this.stateService;
    const pending = pendingOutputMessages.get(instanceId);
    if (!pending || pending.length === 0) return;

    // Clear timer and pending
    outputThrottleTimers.delete(instanceId);
    pendingOutputMessages.delete(instanceId);

    // Apply all pending messages at once
    this.stateService.state.update((current) => {
      const newMap = new Map(current.instances);
      const instance = newMap.get(instanceId);

      if (instance) {
        // Start with existing messages
        const outputBuffer: OutputMessage[] = [...instance.outputBuffer];

        // Process each pending message
        for (const msg of pending) {
          const isStreaming =
            msg.metadata &&
            'streaming' in msg.metadata &&
            msg.metadata['streaming'] === true;

          if (isStreaming) {
            // For streaming messages, update existing or add new
            const existingIdx = outputBuffer.findIndex((m) => m.id === msg.id);
            if (existingIdx >= 0) {
              // Update existing message with accumulated content
              const accumulatedContent =
                msg.metadata && 'accumulatedContent' in msg.metadata
                  ? String(msg.metadata['accumulatedContent'])
                  : msg.content;
              outputBuffer[existingIdx] = {
                ...outputBuffer[existingIdx],
                content: accumulatedContent,
                metadata: msg.metadata,
              };
            } else {
              // First chunk of this streaming message
              outputBuffer.push(msg);
            }
          } else {
            // Regular message - just append
            outputBuffer.push(msg);
          }
        }

        // Keep buffer trimmed
        const trimmed =
          outputBuffer.length > 1000 ? outputBuffer.slice(-1000) : outputBuffer;

        newMap.set(instanceId, {
          ...instance,
          outputBuffer: trimmed,
          lastActivity: Date.now(),
        });
      }

      return { ...current, instances: newMap };
    });
  }

  /**
   * Force flush output for an instance (call on completion)
   */
  flushInstanceOutput(instanceId: string): void {
    const timer = this.stateService.outputThrottleTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      this.stateService.outputThrottleTimers.delete(instanceId);
    }
    this.flushOutput(instanceId);
  }

  /**
   * Clean up timers for an instance (call on remove/destroy)
   */
  cleanupInstance(instanceId: string): void {
    const timer = this.stateService.outputThrottleTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      this.stateService.outputThrottleTimers.delete(instanceId);
    }
    this.stateService.pendingOutputMessages.delete(instanceId);
  }

  /**
   * Clean up all timers (call on destroy)
   */
  cleanupAll(): void {
    for (const timer of this.stateService.outputThrottleTimers.values()) {
      clearTimeout(timer);
    }
    this.stateService.outputThrottleTimers.clear();
    this.stateService.pendingOutputMessages.clear();
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Check if a message has meaningful content to display
   */
  private hasContent(message: OutputMessage): boolean {
    // Tool messages can have metadata as their primary content
    if (message.type === 'tool_use' || message.type === 'tool_result') {
      return !!message.metadata || !!message.content;
    }
    // Messages with attachments are valid even without text
    if (message.attachments && message.attachments.length > 0) {
      return true;
    }
    // Messages with thinking content are valid even without text response
    if (message.thinking && message.thinking.length > 0) {
      return true;
    }
    // For all other messages, check for non-empty content
    return !!message.content?.trim();
  }
}
