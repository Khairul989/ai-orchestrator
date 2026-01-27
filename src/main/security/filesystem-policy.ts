/**
 * Filesystem Policy - Sandbox filesystem access with path isolation
 *
 * Features:
 * - Filesystem isolation: Only access working directory + explicit allowlist
 * - Blocked paths for secrets, credentials, system files
 * - Support for both macOS and Linux
 * - Path resolution with proper normalization
 * - Event emission for access tracking
 * - Configurable read/write boundaries
 *
 * Security Model:
 * 1. Default deny - nothing accessible unless explicitly allowed
 * 2. Working directory is allowed by default
 * 3. Blocked paths are ALWAYS blocked (highest priority)
 * 4. Temp directory can be optionally allowed with prefix enforcement
 * 5. All paths are normalized and resolved to prevent traversal attacks
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';

/**
 * Filesystem policy configuration
 */
export interface FilesystemPolicyConfig {
  /** Paths allowed for reading (absolute paths or globs) */
  readPaths: string[];
  /** Paths allowed for writing (must be subset of readPaths) */
  writePaths: string[];
  /** Paths that are explicitly blocked (highest priority) */
  blockedPaths: string[];
  /** Working directory - always allowed by default */
  workingDirectory: string;
  /** Whether to allow access to temp directory */
  allowTempDir: boolean;
  /** Prefix required for temp directory files */
  tempDirPrefix: string;
}

/**
 * Policy statistics
 */
export interface PolicyStats {
  /** Total read attempts */
  readAttempts: number;
  /** Total write attempts */
  writeAttempts: number;
  /** Successful read access */
  readsAllowed: number;
  /** Successful write access */
  writesAllowed: number;
  /** Denied read access */
  readsDenied: number;
  /** Denied write access */
  writesDenied: number;
  /** Blocked path access attempts */
  blockedAttempts: number;
  /** Number of configured read paths */
  readPathCount: number;
  /** Number of configured write paths */
  writePathCount: number;
  /** Number of blocked paths */
  blockedPathCount: number;
}

/**
 * Access check result
 */
export interface AccessCheckResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Resolved absolute path */
  resolvedPath: string;
  /** Reason for decision */
  reason: string;
  /** Category: 'allowed' | 'denied' | 'blocked' */
  category: 'allowed' | 'denied' | 'blocked';
}

/**
 * Default configuration
 */
export const DEFAULT_FILESYSTEM_CONFIG: FilesystemPolicyConfig = {
  readPaths: [],
  writePaths: [],
  blockedPaths: [
    // SSH keys and config
    '~/.ssh/*',
    '~/.ssh/id_*',
    '~/.ssh/config',

    // AWS credentials
    '~/.aws/credentials',
    '~/.aws/config',

    // GCP credentials
    '~/.config/gcloud/*',
    '~/.config/gcloud/credentials.db',

    // GPG keys
    '~/.gnupg/*',
    '~/.gnupg/private-keys-v1.d/*',

    // System password files (Linux)
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',

    // System configuration (macOS)
    '/etc/master.passwd',
    '/var/db/shadow/*',

    // Docker credentials
    '~/.docker/config.json',

    // Kubernetes credentials
    '~/.kube/config',

    // Browser credential files (Chrome/Chromium)
    '~/Library/Application Support/Google/Chrome/*/Login Data',
    '~/Library/Application Support/Chromium/*/Login Data',
    '~/.config/google-chrome/*/Login Data',
    '~/.config/chromium/*/Login Data',

    // Browser credential files (Firefox)
    '~/Library/Application Support/Firefox/Profiles/*/key*.db',
    '~/Library/Application Support/Firefox/Profiles/*/logins.json',
    '~/.mozilla/firefox/*/key*.db',
    '~/.mozilla/firefox/*/logins.json',

    // Browser credential files (Safari)
    '~/Library/Keychains/*',

    // Environment files
    '**/.env',
    '**/.env.*',
    '**/secrets.json',
    '**/credentials.json',

    // Git credentials
    '~/.git-credentials',
    '~/.netrc',

    // NPM/Yarn tokens
    '~/.npmrc',
    '~/.yarnrc',

    // System binaries and libraries (prevent modification)
    '/bin/*',
    '/sbin/*',
    '/usr/bin/*',
    '/usr/sbin/*',
    '/usr/lib/*',
    '/usr/local/bin/*',
    '/System/*', // macOS

    // Critical system directories
    '/boot/*',
    '/dev/*',
    '/proc/*',
    '/sys/*',
  ],
  workingDirectory: process.cwd(),
  allowTempDir: true,
  tempDirPrefix: 'orchestrator-',
};

/**
 * Filesystem Policy Manager
 */
export class FilesystemPolicy extends EventEmitter {
  private static instance: FilesystemPolicy | null = null;

  private config: FilesystemPolicyConfig;
  private stats: PolicyStats;
  private normalizedBlockedPaths: Set<string> = new Set();
  private normalizedReadPaths: Set<string> = new Set();
  private normalizedWritePaths: Set<string> = new Set();

  private constructor() {
    super();
    this.config = { ...DEFAULT_FILESYSTEM_CONFIG };
    this.stats = this.initStats();
    this.normalizeConfigPaths();
  }

  static getInstance(): FilesystemPolicy {
    if (!FilesystemPolicy.instance) {
      FilesystemPolicy.instance = new FilesystemPolicy();
    }
    return FilesystemPolicy.instance;
  }

  /**
   * Configure the filesystem policy
   */
  configure(config: Partial<FilesystemPolicyConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      // Merge arrays instead of replacing
      readPaths: config.readPaths ? [...this.config.readPaths, ...config.readPaths] : this.config.readPaths,
      writePaths: config.writePaths ? [...this.config.writePaths, ...config.writePaths] : this.config.writePaths,
      blockedPaths: config.blockedPaths ? [...this.config.blockedPaths, ...config.blockedPaths] : this.config.blockedPaths,
    };
    this.normalizeConfigPaths();
    this.emit('configured', this.config);
  }

  /**
   * Check if a path can be read
   */
  canRead(filePath: string): boolean {
    const result = this.checkReadAccess(filePath);

    this.stats.readAttempts++;
    if (result.allowed) {
      this.stats.readsAllowed++;
      this.emit('access:allowed', {
        type: 'read',
        path: result.resolvedPath,
        reason: result.reason
      });
    } else {
      this.stats.readsDenied++;
      if (result.category === 'blocked') {
        this.stats.blockedAttempts++;
      }
      this.emit('access:denied', {
        type: 'read',
        path: result.resolvedPath,
        reason: result.reason,
        category: result.category
      });
    }

    return result.allowed;
  }

  /**
   * Check if a path can be written
   */
  canWrite(filePath: string): boolean {
    const result = this.checkWriteAccess(filePath);

    this.stats.writeAttempts++;
    if (result.allowed) {
      this.stats.writesAllowed++;
      this.emit('access:allowed', {
        type: 'write',
        path: result.resolvedPath,
        reason: result.reason
      });
    } else {
      this.stats.writesDenied++;
      if (result.category === 'blocked') {
        this.stats.blockedAttempts++;
      }
      this.emit('access:denied', {
        type: 'write',
        path: result.resolvedPath,
        reason: result.reason,
        category: result.category
      });
    }

    return result.allowed;
  }

  /**
   * Check if a path is explicitly blocked
   */
  isBlocked(filePath: string): boolean {
    const resolved = this.resolvePath(filePath);
    const normalized = this.normalizePath(resolved);

    // Check exact match
    if (this.normalizedBlockedPaths.has(normalized)) {
      this.emit('access:blocked', { path: normalized, reason: 'Exact match in blocked list' });
      return true;
    }

    // Check pattern match
    for (const blockedPattern of this.config.blockedPaths) {
      if (this.matchesPattern(normalized, blockedPattern)) {
        this.emit('access:blocked', { path: normalized, reason: `Matches blocked pattern: ${blockedPattern}` });
        return true;
      }
    }

    return false;
  }

  /**
   * Add a path to the read allowlist
   */
  addReadPath(filePath: string): void {
    if (!this.config.readPaths.includes(filePath)) {
      this.config.readPaths.push(filePath);
      const normalized = this.normalizePath(this.resolvePath(filePath));
      this.normalizedReadPaths.add(normalized);
      this.emit('path:added', { type: 'read', path: filePath });
    }
  }

  /**
   * Add a path to the write allowlist
   */
  addWritePath(filePath: string): void {
    if (!this.config.writePaths.includes(filePath)) {
      this.config.writePaths.push(filePath);
      const normalized = this.normalizePath(this.resolvePath(filePath));
      this.normalizedWritePaths.add(normalized);
      this.emit('path:added', { type: 'write', path: filePath });

      // Also add to read paths if not already there
      if (!this.config.readPaths.includes(filePath)) {
        this.addReadPath(filePath);
      }
    }
  }

  /**
   * Block a specific path
   */
  blockPath(filePath: string): void {
    if (!this.config.blockedPaths.includes(filePath)) {
      this.config.blockedPaths.push(filePath);
      const normalized = this.normalizePath(this.resolvePath(filePath));
      this.normalizedBlockedPaths.add(normalized);
      this.emit('path:blocked', { path: filePath });
    }
  }

  /**
   * Resolve a path to absolute form
   */
  resolvePath(filePath: string): string {
    // Handle home directory expansion
    let resolved = filePath;
    if (resolved.startsWith('~')) {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }

    // Resolve relative paths against working directory
    if (!path.isAbsolute(resolved)) {
      resolved = path.resolve(this.config.workingDirectory, resolved);
    }

    // Normalize to remove . and .. segments
    resolved = path.normalize(resolved);

    return resolved;
  }

  /**
   * Get policy statistics
   */
  getStats(): PolicyStats {
    return {
      ...this.stats,
      readPathCount: this.config.readPaths.length,
      writePathCount: this.config.writePaths.length,
      blockedPathCount: this.config.blockedPaths.length,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): FilesystemPolicyConfig {
    return { ...this.config };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initStats();
    this.emit('stats:reset');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.normalizedBlockedPaths.clear();
    this.normalizedReadPaths.clear();
    this.normalizedWritePaths.clear();
    this.removeAllListeners();
    FilesystemPolicy.instance = null;
  }

  // ============================================
  // Private Methods
  // ============================================

  private initStats(): PolicyStats {
    return {
      readAttempts: 0,
      writeAttempts: 0,
      readsAllowed: 0,
      writesAllowed: 0,
      readsDenied: 0,
      writesDenied: 0,
      blockedAttempts: 0,
      readPathCount: 0,
      writePathCount: 0,
      blockedPathCount: 0,
    };
  }

  private normalizeConfigPaths(): void {
    this.normalizedBlockedPaths.clear();
    this.normalizedReadPaths.clear();
    this.normalizedWritePaths.clear();

    // Normalize blocked paths
    for (const blockedPath of this.config.blockedPaths) {
      if (!blockedPath.includes('*')) {
        const normalized = this.normalizePath(this.resolvePath(blockedPath));
        this.normalizedBlockedPaths.add(normalized);
      }
    }

    // Normalize read paths
    for (const readPath of this.config.readPaths) {
      if (!readPath.includes('*')) {
        const normalized = this.normalizePath(this.resolvePath(readPath));
        this.normalizedReadPaths.add(normalized);
      }
    }

    // Normalize write paths
    for (const writePath of this.config.writePaths) {
      if (!writePath.includes('*')) {
        const normalized = this.normalizePath(this.resolvePath(writePath));
        this.normalizedWritePaths.add(normalized);
      }
    }
  }

  private normalizePath(filePath: string): string {
    // Convert to lowercase for case-insensitive comparison on macOS
    const normalized = path.normalize(filePath);
    return process.platform === 'darwin' ? normalized.toLowerCase() : normalized;
  }

  private checkReadAccess(filePath: string): AccessCheckResult {
    const resolved = this.resolvePath(filePath);
    const normalized = this.normalizePath(resolved);

    // 1. Check if blocked (highest priority)
    if (this.isBlocked(filePath)) {
      return {
        allowed: false,
        resolvedPath: resolved,
        reason: 'Path is in blocked list',
        category: 'blocked',
      };
    }

    // 2. Check if in working directory
    const normalizedWorkingDir = this.normalizePath(this.config.workingDirectory);
    if (normalized.startsWith(normalizedWorkingDir)) {
      return {
        allowed: true,
        resolvedPath: resolved,
        reason: 'Within working directory',
        category: 'allowed',
      };
    }

    // 3. Check if in temp directory (if allowed)
    if (this.config.allowTempDir) {
      const tmpDir = this.normalizePath(os.tmpdir());
      if (normalized.startsWith(tmpDir)) {
        // Check prefix requirement
        const basename = path.basename(resolved);
        if (!this.config.tempDirPrefix || basename.startsWith(this.config.tempDirPrefix)) {
          return {
            allowed: true,
            resolvedPath: resolved,
            reason: 'Within allowed temp directory',
            category: 'allowed',
          };
        }
      }
    }

    // 4. Check explicit read paths
    if (this.normalizedReadPaths.has(normalized)) {
      return {
        allowed: true,
        resolvedPath: resolved,
        reason: 'In read allowlist',
        category: 'allowed',
      };
    }

    // 5. Check read path patterns
    for (const readPath of this.config.readPaths) {
      if (this.matchesPattern(normalized, readPath)) {
        return {
          allowed: true,
          resolvedPath: resolved,
          reason: `Matches read pattern: ${readPath}`,
          category: 'allowed',
        };
      }
    }

    // Default: deny
    return {
      allowed: false,
      resolvedPath: resolved,
      reason: 'Not in working directory or allowlist',
      category: 'denied',
    };
  }

  private checkWriteAccess(filePath: string): AccessCheckResult {
    const resolved = this.resolvePath(filePath);
    const normalized = this.normalizePath(resolved);

    // 1. Check if blocked (highest priority)
    if (this.isBlocked(filePath)) {
      return {
        allowed: false,
        resolvedPath: resolved,
        reason: 'Path is in blocked list',
        category: 'blocked',
      };
    }

    // 2. Check if in working directory
    const normalizedWorkingDir = this.normalizePath(this.config.workingDirectory);
    if (normalized.startsWith(normalizedWorkingDir)) {
      return {
        allowed: true,
        resolvedPath: resolved,
        reason: 'Within working directory',
        category: 'allowed',
      };
    }

    // 3. Check if in temp directory (if allowed)
    if (this.config.allowTempDir) {
      const tmpDir = this.normalizePath(os.tmpdir());
      if (normalized.startsWith(tmpDir)) {
        // Check prefix requirement
        const basename = path.basename(resolved);
        if (!this.config.tempDirPrefix || basename.startsWith(this.config.tempDirPrefix)) {
          return {
            allowed: true,
            resolvedPath: resolved,
            reason: 'Within allowed temp directory',
            category: 'allowed',
          };
        }
      }
    }

    // 4. Check explicit write paths
    if (this.normalizedWritePaths.has(normalized)) {
      return {
        allowed: true,
        resolvedPath: resolved,
        reason: 'In write allowlist',
        category: 'allowed',
      };
    }

    // 5. Check write path patterns
    for (const writePath of this.config.writePaths) {
      if (this.matchesPattern(normalized, writePath)) {
        return {
          allowed: true,
          resolvedPath: resolved,
          reason: `Matches write pattern: ${writePath}`,
          category: 'allowed',
        };
      }
    }

    // Default: deny
    return {
      allowed: false,
      resolvedPath: resolved,
      reason: 'Not in working directory or write allowlist',
      category: 'denied',
    };
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Resolve and normalize the pattern
    const resolvedPattern = this.resolvePath(pattern);
    const normalizedPattern = this.normalizePath(resolvedPattern);

    // Handle glob patterns
    if (pattern.includes('*')) {
      const regexPattern = normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '<<DOUBLESTAR>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<DOUBLESTAR>>/g, '.*')
        .replace(/\?/g, '.');

      try {
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
      } catch {
        return false;
      }
    }

    // Exact match or prefix match
    return filePath === normalizedPattern || filePath.startsWith(normalizedPattern + path.sep);
  }
}

/**
 * Get the filesystem policy singleton
 */
export function getFilesystemPolicy(): FilesystemPolicy {
  return FilesystemPolicy.getInstance();
}

export default FilesystemPolicy;
