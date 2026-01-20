/**
 * Verification UI Types
 * UI-specific types for the Multi-Agent Verification feature
 */

import type { CliType } from './unified-cli-response';
import type { PersonalityType, SynthesisStrategy } from './verification.types';

// ============================================
// Streaming Text Types
// ============================================

/**
 * Options for streaming text display
 */
export interface StreamingTextOptions {
  /** Enable markdown rendering */
  enableMarkdown: boolean;
  /** Show blinking cursor at end */
  showCursor: boolean;
  /** Auto-scroll to bottom as text streams */
  autoScroll: boolean;
  /** Animation speed in ms between characters */
  charDelay?: number;
  /** Custom CSS class for styling */
  cssClass?: string;
}

// ============================================
// Cost & Token Types
// ============================================

/**
 * Cost breakdown per agent
 */
export interface CostBreakdown {
  /** Unique agent identifier */
  agentId: string;
  /** Display name of the agent */
  agentName: string;
  /** Number of input tokens */
  inputTokens: number;
  /** Number of output tokens */
  outputTokens: number;
  /** Total cost in USD */
  totalCost: number;
  /** Cost per input token */
  inputCostRate?: number;
  /** Cost per output token */
  outputCostRate?: number;
  /** Model used */
  model?: string;
}

/**
 * Session cost summary
 */
export interface SessionCostSummary {
  /** Total input tokens across all agents */
  totalInputTokens: number;
  /** Total output tokens across all agents */
  totalOutputTokens: number;
  /** Total cost in USD */
  totalCost: number;
  /** Per-agent breakdown */
  breakdown: CostBreakdown[];
  /** Timestamp of calculation */
  calculatedAt: number;
}

// ============================================
// Timeline Types
// ============================================

/**
 * Timeline event types
 */
export type TimelineEventType =
  | 'start'
  | 'progress'
  | 'complete'
  | 'error'
  | 'agent-start'
  | 'agent-complete'
  | 'round-start'
  | 'round-complete'
  | 'synthesis-start'
  | 'synthesis-complete'
  | 'consensus-reached';

/**
 * Single timeline event
 */
export interface TimelineEvent {
  /** Unique event ID */
  id: string;
  /** Unix timestamp in ms */
  timestamp: number;
  /** Event type */
  type: TimelineEventType;
  /** Human-readable label */
  label: string;
  /** Optional description */
  description?: string;
  /** Optional related entity ID (agent, round, etc.) */
  relatedId?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Timeline display configuration
 */
export interface TimelineConfig {
  /** Show timestamps */
  showTimestamps: boolean;
  /** Show elapsed time */
  showElapsed: boolean;
  /** Max events to display */
  maxEvents?: number;
  /** Group by type */
  groupByType: boolean;
  /** Color map for event types */
  colorMap?: Record<TimelineEventType, string>;
}

// ============================================
// CLI Status Types
// ============================================

/**
 * CLI status values
 */
export type CliStatus = 'available' | 'auth-required' | 'not-found' | 'error' | 'checking';

/**
 * CLI status information for UI
 */
export interface CliStatusInfo {
  /** CLI type identifier */
  type: CliType;
  /** Current status */
  status: CliStatus;
  /** CLI version if available */
  version?: string;
  /** Path to CLI executable */
  path?: string;
  /** Error message if status is error */
  errorMessage?: string;
  /** Last check timestamp */
  lastChecked?: number;
  /** Available capabilities */
  capabilities?: string[];
}

/**
 * CLI detection scan result for UI
 */
export interface CliScanResult {
  /** All detected CLIs */
  clis: CliStatusInfo[];
  /** Scan timestamp */
  scannedAt: number;
  /** Scan duration in ms */
  duration: number;
  /** Any scan errors */
  errors?: string[];
}

// ============================================
// Agent Capability Types
// ============================================

/**
 * Agent capability badges
 */
export type AgentCapability =
  | 'streaming'
  | 'tools'
  | 'vision'
  | 'local'
  | 'code-execution'
  | 'web-search'
  | 'file-access'
  | 'long-context';

/**
 * Capability display info
 */
export interface CapabilityInfo {
  /** Capability key */
  key: AgentCapability;
  /** Display label */
  label: string;
  /** Icon name or emoji */
  icon: string;
  /** Description */
  description: string;
  /** Whether this is a premium feature */
  isPremium?: boolean;
}

// ============================================
// Confidence Meter Types
// ============================================

/**
 * Confidence level thresholds
 */
export interface ConfidenceThresholds {
  /** Score below this is low confidence */
  low: number;
  /** Score above this is high confidence */
  high: number;
}

/**
 * Confidence display options
 */
export interface ConfidenceDisplayOptions {
  /** Show percentage text */
  showPercentage: boolean;
  /** Show level label (Low/Medium/High) */
  showLabel: boolean;
  /** Animate value changes */
  animate: boolean;
  /** Size variant */
  size: 'small' | 'medium' | 'large';
  /** Custom thresholds */
  thresholds?: ConfidenceThresholds;
}

// ============================================
// Progress Tracker Types
// ============================================

/**
 * Agent progress state
 */
export type AgentProgressStatus = 'pending' | 'running' | 'complete' | 'error' | 'cancelled';

/**
 * Progress item for multi-agent tracking
 */
export interface ProgressItem {
  /** Agent ID */
  id: string;
  /** Agent display name */
  name: string;
  /** Current status */
  status: AgentProgressStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current activity description */
  activity?: string;
  /** Tokens used so far */
  tokens?: number;
  /** Time elapsed in ms */
  elapsed?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Progress tracker configuration
 */
export interface ProgressTrackerConfig {
  /** Show token counts */
  showTokens: boolean;
  /** Show elapsed time */
  showTime: boolean;
  /** Show activity text */
  showActivity: boolean;
  /** Collapse completed items */
  collapseCompleted: boolean;
}

// ============================================
// Synthesis View Types
// ============================================

/**
 * Synthesis section in the final output
 */
export interface SynthesisSection {
  /** Section ID */
  id: string;
  /** Section title */
  title: string;
  /** Section content */
  content: string;
  /** Source agent IDs that contributed */
  sourceAgents: string[];
  /** Confidence score for this section */
  confidence: number;
  /** Whether this section had disagreement */
  hasDisagreement: boolean;
}

/**
 * Synthesis view display options
 */
export interface SynthesisDisplayOptions {
  /** Show source attribution */
  showSources: boolean;
  /** Show confidence badges */
  showConfidence: boolean;
  /** Highlight disagreements */
  highlightDisagreements: boolean;
  /** Enable expand/collapse sections */
  collapsible: boolean;
  /** Show export button */
  showExport: boolean;
}

// ============================================
// Debate Round Types
// ============================================

/**
 * Single debate exchange
 */
export interface DebateExchange {
  /** Exchange ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** The argument or response */
  argument: string;
  /** Response to another agent's point */
  rebuttal?: string;
  /** Whether agent changed position */
  positionChange: boolean;
  /** Confidence in this position */
  confidence: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Debate round summary
 */
export interface DebateRoundSummary {
  /** Round number (1-based) */
  roundNumber: number;
  /** Round type */
  roundType: 'opening' | 'rebuttal' | 'closing';
  /** All exchanges in this round */
  exchanges: DebateExchange[];
  /** Consensus score after this round */
  consensusScore: number;
  /** Key agreements reached */
  agreements: string[];
  /** Remaining disagreements */
  disagreements: string[];
  /** Duration of round in ms */
  duration: number;
}

// ============================================
// Launcher Types
// ============================================

/**
 * Verification launcher form data
 */
export interface VerificationLauncherForm {
  /** The prompt to verify */
  prompt: string;
  /** Optional context */
  context?: string;
  /** Selected CLI agents */
  selectedAgents: CliType[];
  /** Selected personality types */
  personalities: PersonalityType[];
  /** Synthesis strategy */
  synthesisStrategy: SynthesisStrategy;
  /** Confidence threshold */
  confidenceThreshold: number;
  /** Max debate rounds */
  maxDebateRounds: number;
}

/**
 * Launcher validation state
 */
export interface LauncherValidation {
  /** Overall validity */
  isValid: boolean;
  /** Field-level errors */
  errors: {
    prompt?: string;
    agents?: string;
    personalities?: string;
  };
  /** Warnings (non-blocking) */
  warnings: string[];
}

// ============================================
// Export Types
// ============================================

/**
 * Export format options
 */
export type VerificationExportFormat = 'json' | 'markdown' | 'pdf' | 'html';

/**
 * Export options
 */
export interface VerificationExportOptions {
  /** Export format */
  format: VerificationExportFormat;
  /** Include raw responses */
  includeRawResponses: boolean;
  /** Include cost breakdown */
  includeCosts: boolean;
  /** Include timeline */
  includeTimeline: boolean;
  /** Include debate rounds */
  includeDebateRounds: boolean;
  /** Custom filename */
  filename?: string;
}

// ============================================
// Default Values
// ============================================

/**
 * Default streaming text options
 */
export const DEFAULT_STREAMING_OPTIONS: StreamingTextOptions = {
  enableMarkdown: true,
  showCursor: true,
  autoScroll: true,
  charDelay: 10,
};

/**
 * Default confidence thresholds
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  low: 0.4,
  high: 0.75,
};

/**
 * Default timeline color map
 */
export const DEFAULT_TIMELINE_COLORS: Record<TimelineEventType, string> = {
  'start': '#3b82f6',
  'progress': '#8b5cf6',
  'complete': '#22c55e',
  'error': '#ef4444',
  'agent-start': '#06b6d4',
  'agent-complete': '#10b981',
  'round-start': '#f59e0b',
  'round-complete': '#eab308',
  'synthesis-start': '#ec4899',
  'synthesis-complete': '#d946ef',
  'consensus-reached': '#22c55e',
};

/**
 * Capability info map
 */
export const CAPABILITY_INFO: Record<AgentCapability, CapabilityInfo> = {
  'streaming': {
    key: 'streaming',
    label: 'Streaming',
    icon: '⚡',
    description: 'Real-time response streaming',
  },
  'tools': {
    key: 'tools',
    label: 'Tools',
    icon: '🔧',
    description: 'Tool/function calling support',
  },
  'vision': {
    key: 'vision',
    label: 'Vision',
    icon: '👁',
    description: 'Image understanding capabilities',
  },
  'local': {
    key: 'local',
    label: 'Local',
    icon: '💻',
    description: 'Runs locally, no API calls',
  },
  'code-execution': {
    key: 'code-execution',
    label: 'Code Exec',
    icon: '▶️',
    description: 'Can execute code',
  },
  'web-search': {
    key: 'web-search',
    label: 'Web Search',
    icon: '🔍',
    description: 'Internet search capabilities',
  },
  'file-access': {
    key: 'file-access',
    label: 'Files',
    icon: '📁',
    description: 'File system access',
  },
  'long-context': {
    key: 'long-context',
    label: 'Long Context',
    icon: '📜',
    description: 'Extended context window',
    isPremium: true,
  },
};
