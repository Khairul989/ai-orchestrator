/**
 * IPC Payload Validation Schemas
 *
 * Zod schemas for runtime validation of critical IPC payloads.
 * These schemas validate data crossing the main/renderer boundary.
 */

import { z } from 'zod';

// ============ Common Schemas ============

export const InstanceIdSchema = z.string().min(1).max(100);
export const SessionIdSchema = z.string().min(1).max(100);
export const DisplayNameSchema = z.string().min(1).max(200);
export const WorkingDirectorySchema = z.string().min(1).max(1000);
export const FilePathSchema = z.string().min(1).max(2000);
export const DirectoryPathSchema = z.string().min(1).max(2000);
export const SnapshotIdSchema = z.string().min(1).max(100);
export const StoreIdSchema = z.string().min(1).max(200);

// ============ File Attachment Schema ============

export const FileAttachmentSchema = z.object({
  name: z.string().max(500),
  type: z.string().max(100),
  size: z.number().int().min(0).max(50 * 1024 * 1024), // 50MB max
  data: z.string().optional(), // Base64 encoded
});

// ============ Instance Creation ============

export const InstanceCreatePayloadSchema = z.object({
  workingDirectory: WorkingDirectorySchema,
  sessionId: SessionIdSchema.optional(),
  parentInstanceId: InstanceIdSchema.optional(),
  displayName: DisplayNameSchema.optional(),
  initialPrompt: z.string().max(500000).optional(),
  attachments: z.array(FileAttachmentSchema).max(10).optional(),
  yoloMode: z.boolean().optional(),
  agentId: z.string().max(100).optional(),
  provider: z.enum(['auto', 'claude', 'openai', 'codex', 'gemini', 'copilot']).optional(),
  model: z.string().max(100).optional(),
});

export type ValidatedInstanceCreatePayload = z.infer<typeof InstanceCreatePayloadSchema>;

// ============ Instance Input ============

export const InstanceSendInputPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  message: z.string().min(1).max(500000), // 500KB max message
  attachments: z.array(z.object({
    name: z.string().max(500),
    type: z.string().max(100),
    size: z.number().int().min(0).max(50 * 1024 * 1024),
    data: z.string().optional(),
  })).max(10).optional(),
});

export type InstanceSendInputPayload = z.infer<typeof InstanceSendInputPayloadSchema>;

// ============ Instance Operations ============

export const InstanceTerminatePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  graceful: z.boolean().optional().default(true),
});

export type InstanceTerminatePayload = z.infer<typeof InstanceTerminatePayloadSchema>;

export const InstanceRenamePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  displayName: DisplayNameSchema,
});

export type InstanceRenamePayload = z.infer<typeof InstanceRenamePayloadSchema>;

export const InstanceChangeAgentPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  agentId: z.string().min(1).max(100),
});

export type InstanceChangeAgentPayload = z.infer<typeof InstanceChangeAgentPayloadSchema>;

export const InstanceChangeModelPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  model: z.string().min(1).max(100),
});

export type InstanceChangeModelPayload = z.infer<typeof InstanceChangeModelPayloadSchema>;

// ============ Input Required Response ============

export const InputRequiredResponsePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  requestId: z.string().min(1).max(100),
  response: z.string().min(1).max(10000),
  permissionKey: z.string().max(200).optional(),
});

export type InputRequiredResponsePayload = z.infer<typeof InputRequiredResponsePayloadSchema>;

// ============ Settings ============

export const SettingsGetPayloadSchema = z.object({
  key: z.string().min(1).max(100),
});

export const SettingsUpdatePayloadSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(), // Settings can be various types
});

export const SettingsBulkUpdatePayloadSchema = z.object({
  settings: z.record(z.string(), z.unknown()).optional(),
}).passthrough(); // Allow direct settings as well

export const SettingsResetOnePayloadSchema = z.object({
  key: z.string().min(1).max(100),
});

export type SettingsUpdatePayload = z.infer<typeof SettingsUpdatePayloadSchema>;

// ============ Config ============

const ConfigPathSchema = z.string().min(1).max(2000);

export const ConfigResolvePayloadSchema = z.object({
  workingDirectory: WorkingDirectorySchema,
});

export const ConfigGetProjectPayloadSchema = z.object({
  configPath: ConfigPathSchema,
});

export const ConfigSaveProjectPayloadSchema = z.object({
  configPath: ConfigPathSchema,
  config: z.record(z.string(), z.unknown()), // ProjectConfig is complex, validate structure
});

export const ConfigCreateProjectPayloadSchema = z.object({
  projectDir: WorkingDirectorySchema,
  config: z.record(z.string(), z.unknown()).optional(),
});

export const ConfigFindProjectPayloadSchema = z.object({
  startDir: WorkingDirectorySchema,
});

// ============ Remote Config ============

const UrlSchema = z.string().url().max(2000);
const DomainSchema = z.string().min(1).max(255);
const GitHubOwnerSchema = z.string().min(1).max(100);
const GitHubRepoSchema = z.string().min(1).max(100);

export const RemoteConfigFetchUrlPayloadSchema = z.object({
  url: UrlSchema,
  timeout: z.number().int().min(0).max(60000).optional(),
  cacheTTL: z.number().int().min(0).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  useCache: z.boolean().optional(),
});

export const RemoteConfigFetchWellKnownPayloadSchema = z.object({
  domain: DomainSchema,
  timeout: z.number().int().min(0).max(60000).optional(),
  cacheTTL: z.number().int().min(0).optional(),
});

export const RemoteConfigFetchGitHubPayloadSchema = z.object({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  branch: z.string().max(100).optional(),
});

export const RemoteConfigDiscoverGitPayloadSchema = z.object({
  gitRemoteUrl: UrlSchema,
});

export const RemoteConfigInvalidatePayloadSchema = z.object({
  url: UrlSchema,
});

// ============ User Action Response ============

export const UserActionResponsePayloadSchema = z.object({
  requestId: z.string().min(1).max(100),
  action: z.enum(['approve', 'reject', 'custom']),
  customValue: z.string().max(10000).optional(),
});

export type UserActionResponsePayload = z.infer<typeof UserActionResponsePayloadSchema>;

// ============ Orchestration Commands ============

export const SpawnChildPayloadSchema = z.object({
  parentInstanceId: InstanceIdSchema,
  task: z.string().min(1).max(100000),
  name: z.string().max(200).optional(),
  agentId: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  provider: z.enum(['auto', 'claude', 'codex', 'gemini', 'copilot']).optional(),
});

export type SpawnChildPayload = z.infer<typeof SpawnChildPayloadSchema>;

export const MessageChildPayloadSchema = z.object({
  parentInstanceId: InstanceIdSchema,
  childId: InstanceIdSchema,
  message: z.string().min(1).max(100000),
});

export type MessageChildPayload = z.infer<typeof MessageChildPayloadSchema>;

// ============ Commands ============

const CommandIdSchema = z.string().min(1).max(100);

export const CommandExecutePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  commandId: CommandIdSchema,
  args: z.array(z.string().max(10000)).max(50).optional(),
});

export const CommandCreatePayloadSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  template: z.string().min(1).max(100000),
  hint: z.string().max(500).optional(),
  shortcut: z.string().max(50).optional(),
});

export const CommandUpdatePayloadSchema = z.object({
  commandId: CommandIdSchema,
  updates: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(1000).optional(),
    template: z.string().min(1).max(100000).optional(),
    hint: z.string().max(500).optional(),
    shortcut: z.string().max(50).optional(),
  }),
});

export const CommandDeletePayloadSchema = z.object({
  commandId: CommandIdSchema,
});

// ============ Plan Mode ============

export const PlanModeEnterPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
});

export const PlanModeExitPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  force: z.boolean().optional(),
});

export const PlanModeApprovePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  planContent: z.string().max(500000),
});

export const PlanModeUpdatePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  planContent: z.string().max(500000),
});

export const PlanModeGetStatePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
});

// ============ File Operations ============

// Editor operations
export const EditorOpenFilePayloadSchema = z.object({
  filePath: FilePathSchema,
  line: z.number().int().min(0).optional(),
  column: z.number().int().min(0).optional(),
  waitForClose: z.boolean().optional(),
  newWindow: z.boolean().optional(),
});

export const EditorOpenFileAtLinePayloadSchema = z.object({
  filePath: FilePathSchema,
  line: z.number().int().min(0),
  column: z.number().int().min(0).optional(),
});

export const EditorOpenDirectoryPayloadSchema = z.object({
  dirPath: DirectoryPathSchema,
});

export const EditorSetPreferredPayloadSchema = z.object({
  type: z.string().min(1).max(50),
  path: z.string().max(2000).optional(),
  args: z.array(z.string().max(500)).max(20).optional(),
});

// Watcher operations
export const WatcherStartPayloadSchema = z.object({
  directory: DirectoryPathSchema,
  ignored: z.array(z.string().max(500)).max(100).optional(),
  useGitignore: z.boolean().optional(),
  depth: z.number().int().min(0).max(20).optional(),
  ignoreInitial: z.boolean().optional(),
  debounceMs: z.number().int().min(0).max(10000).optional(),
});

export const WatcherStopPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const WatcherGetChangesPayloadSchema = z.object({
  sessionId: SessionIdSchema,
  limit: z.number().int().min(1).max(1000).optional(),
});

export const WatcherClearBufferPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

// Multi-edit operations
export const MultiEditOperationSchema = z.object({
  filePath: FilePathSchema,
  oldString: z.string().max(100000),
  newString: z.string().max(100000),
  mode: z.enum(['exact', 'regex']).optional(),
});

export const MultiEditPayloadSchema = z.object({
  edits: z.array(MultiEditOperationSchema).min(1).max(100),
  instanceId: InstanceIdSchema.optional(),
  takeSnapshots: z.boolean().optional(),
});

// ============ Snapshot Operations ============

export const SnapshotTakePayloadSchema = z.object({
  filePath: FilePathSchema,
  instanceId: InstanceIdSchema,
  sessionId: SessionIdSchema.optional(),
  action: z.enum(['create', 'modify', 'delete']).optional(),
});

export const SnapshotStartSessionPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
  description: z.string().max(500).optional(),
});

export const SnapshotEndSessionPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const SnapshotGetForInstancePayloadSchema = z.object({
  instanceId: InstanceIdSchema,
});

export const SnapshotGetForFilePayloadSchema = z.object({
  filePath: FilePathSchema,
});

export const SnapshotGetSessionsPayloadSchema = z.object({
  instanceId: InstanceIdSchema,
});

export const SnapshotGetContentPayloadSchema = z.object({
  snapshotId: SnapshotIdSchema,
});

export const SnapshotRevertFilePayloadSchema = z.object({
  snapshotId: SnapshotIdSchema,
});

export const SnapshotRevertSessionPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const SnapshotGetDiffPayloadSchema = z.object({
  snapshotId: SnapshotIdSchema,
});

export const SnapshotDeletePayloadSchema = z.object({
  snapshotId: SnapshotIdSchema,
});

export const SnapshotCleanupPayloadSchema = z.object({
  maxAgeDays: z.number().int().min(1).max(3650),
});

// ============ Codebase Operations ============

export const CodebaseIndexStorePayloadSchema = z.object({
  storeId: StoreIdSchema,
  rootPath: DirectoryPathSchema,
  options: z.object({
    force: z.boolean().optional(),
    filePatterns: z.array(z.string().max(500)).max(100).optional(),
  }).optional(),
});

export const CodebaseIndexFilePayloadSchema = z.object({
  storeId: StoreIdSchema,
  filePath: FilePathSchema,
});

export const CodebaseWatcherPayloadSchema = z.object({
  storeId: StoreIdSchema,
  rootPath: DirectoryPathSchema.optional(),
});

// ============ Validation Helper ============

/**
 * Validate an IPC payload against a schema.
 * Returns the validated data or throws a descriptive error.
 */
export function validateIpcPayload<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues
      .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`IPC validation failed for ${context}: ${errors}`);
  }
  return result.data;
}

/**
 * Safe validation that returns null instead of throwing
 */
export function safeValidateIpcPayload<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
