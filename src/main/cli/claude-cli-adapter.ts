/**
 * Claude CLI Adapter - Backward compatibility re-export
 *
 * The main implementation has been moved to ./adapters/claude-cli-adapter.ts
 * This file re-exports for backward compatibility with existing imports.
 */

// Re-export everything from the new location
export {
  ClaudeCliAdapter,
  ClaudeCliSpawnOptions,
  ClaudeCliAdapterEvents,
} from './adapters/claude-cli-adapter';

// Re-export base types that may be used
export type {
  CliAdapterConfig,
  CliCapabilities,
  CliMessage,
  CliResponse,
  CliToolCall,
  CliUsage,
  CliStatus,
} from './adapters/base-cli-adapter';

// Legacy type alias for backward compatibility
export type CliAdapterEvents = import('./adapters/claude-cli-adapter').ClaudeCliAdapterEvents;
