/**
 * Singleton Reset Utilities for Testing
 *
 * Provides utilities to reset singleton instances during testing.
 * This is crucial for unit tests to ensure clean state between test runs.
 *
 * Usage in tests:
 * ```typescript
 * import { resetAllSingletons, registerResettable } from '../testing/singleton-reset';
 *
 * beforeEach(() => {
 *   resetAllSingletons();
 * });
 * ```
 *
 * To make a singleton resettable, add the _resetForTesting method:
 * ```typescript
 * class MySingleton {
 *   private static instance: MySingleton;
 *
 *   static getInstance(): MySingleton {
 *     if (!this.instance) {
 *       this.instance = new MySingleton();
 *     }
 *     return this.instance;
 *   }
 *
 *   // Add this method for testing
 *   static _resetForTesting(): void {
 *     if (this.instance) {
 *       this.instance.cleanup?.(); // Optional cleanup
 *       this.instance = undefined as any;
 *     }
 *   }
 * }
 * ```
 */

/**
 * Interface for resettable singletons
 */
export interface ResettableSingleton {
  _resetForTesting(): void;
}

/**
 * Registry of all resettable singletons
 */
const resettableRegistry = new Set<ResettableSingleton>();

/**
 * Register a singleton for reset during testing
 */
export function registerResettable(singleton: ResettableSingleton): void {
  resettableRegistry.add(singleton);
}

/**
 * Unregister a singleton from reset registry
 */
export function unregisterResettable(singleton: ResettableSingleton): void {
  resettableRegistry.delete(singleton);
}

/**
 * Reset all registered singletons
 * Call this in beforeEach() in your test files
 */
export function resetAllSingletons(): void {
  for (const singleton of resettableRegistry) {
    try {
      singleton._resetForTesting();
    } catch (error) {
      console.warn('Failed to reset singleton:', error);
    }
  }
}

/**
 * Get the count of registered resettable singletons
 */
export function getResettableCount(): number {
  return resettableRegistry.size;
}

/**
 * Clear the registry (useful for cleanup after tests)
 */
export function clearResettableRegistry(): void {
  resettableRegistry.clear();
}

// Import all singletons with _resetForTesting methods
import { SupervisorTree } from '../process/supervisor-tree';
import { EmbeddingService } from '../orchestration/embedding-service';
import { DebateCoordinator } from '../orchestration/debate-coordinator';
import { MultiVerifyCoordinator } from '../orchestration/multi-verify-coordinator';

/**
 * Reset all known singletons by directly calling their _resetForTesting methods.
 * This is an alternative to the registry pattern above.
 *
 * Usage in tests:
 * ```typescript
 * import { resetAllSingletonsForTesting } from '../testing/singleton-reset';
 *
 * beforeEach(() => {
 *   resetAllSingletonsForTesting();
 * });
 * ```
 *
 * Currently resets:
 * - SupervisorTree
 * - EmbeddingService (orchestration)
 * - DebateCoordinator
 * - MultiVerifyCoordinator
 */
export function resetAllSingletonsForTesting(): void {
  SupervisorTree._resetForTesting();
  EmbeddingService._resetForTesting();
  DebateCoordinator._resetForTesting();
  MultiVerifyCoordinator._resetForTesting();
}
