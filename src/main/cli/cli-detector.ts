/**
 * CLI Detector - Backward compatibility re-export
 *
 * The main implementation has been moved to ./cli-detection.ts
 * This file re-exports for backward compatibility with existing imports.
 */

// Re-export everything from the new location
export {
  CliDetectionService,
  CliInfo,
  CliType,
  DetectionResult,
  detectAvailableClis,
  isCliAvailable,
  getDefaultCli,
  getCliConfig,
} from './cli-detection';
