/**
 * Settings Manager - Manages application settings with persistence
 */

import ElectronStore from 'electron-store';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { AppSettings } from '../../../shared/types/settings.types';
import { DEFAULT_SETTINGS } from '../../../shared/types/settings.types';

/**
 * Legacy app name for migration purposes
 */
const LEGACY_APP_NAME = 'claude-orchestrator';

// Type for the internal store with the methods we need
interface Store<T> {
  store: T;
  path: string;
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  set(object: Partial<T>): void;
  clear(): void;
}

export class SettingsManager extends EventEmitter {
  private store: Store<AppSettings>;

  constructor() {
    super();

    // Attempt migration from legacy app data before initializing store
    this.migrateFromLegacyApp();

    // Cast to our Store interface to work around ESM type resolution issues
    this.store = new ElectronStore<AppSettings>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS,
    }) as unknown as Store<AppSettings>;

    // Migrate stale model names to bare shorthand names
    this.migrateModelNames();
  }

  /**
   * Migrate old full model IDs (e.g. 'claude-opus-4-5') to bare shorthand names ('opus').
   * electron-store persists values, so changing DEFAULT_SETTINGS alone won't update
   * already-persisted values.
   */
  private migrateModelNames(): void {
    const MODEL_MIGRATION: Record<string, string> = {
      'claude-opus-4-5': 'opus',
      'claude-opus-4-5-20250918': 'opus',
      'claude-sonnet-4-5': 'sonnet',
      'claude-sonnet-4-5-20250929': 'sonnet',
      'claude-haiku-4-5': 'haiku',
      'claude-haiku-4-5-20251001': 'haiku',
      // Older generation
      'claude-sonnet-4-20250514': 'sonnet',
      'claude-opus-4-20250514': 'opus',
      'claude-3-5-sonnet-20241022': 'sonnet',
      'claude-3-5-haiku-20241022': 'haiku',
    };

    const currentModel = this.store.get('defaultModel');
    if (currentModel && MODEL_MIGRATION[currentModel]) {
      const newModel = MODEL_MIGRATION[currentModel];
      console.log(`[SettingsManager] Migrating defaultModel: '${currentModel}' → '${newModel}'`);
      this.store.set('defaultModel', newModel);
    }
  }

  /**
   * Migrate settings from legacy "claude-orchestrator" to "ai-orchestrator"
   * This runs once on first launch after the rename
   */
  private migrateFromLegacyApp(): void {
    try {
      const currentUserData = app.getPath('userData');
      const legacyUserData = currentUserData.replace(/ai-orchestrator$/i, LEGACY_APP_NAME);

      // Skip if already migrated or no legacy data exists
      if (currentUserData === legacyUserData) return;
      if (!fs.existsSync(legacyUserData)) return;

      // Check if migration already done (current settings exist)
      const currentSettingsPath = path.join(currentUserData, 'settings.json');
      if (fs.existsSync(currentSettingsPath)) return;

      // Ensure current user data directory exists
      if (!fs.existsSync(currentUserData)) {
        fs.mkdirSync(currentUserData, { recursive: true });
      }

      // Migrate settings file
      const legacySettingsPath = path.join(legacyUserData, 'settings.json');
      if (fs.existsSync(legacySettingsPath)) {
        fs.copyFileSync(legacySettingsPath, currentSettingsPath);
        console.log('[SettingsManager] Migrated settings from legacy app');
      }

      // Migrate recent directories
      const legacyRecentDirs = path.join(legacyUserData, 'recent-directories.json');
      const currentRecentDirs = path.join(currentUserData, 'recent-directories.json');
      if (fs.existsSync(legacyRecentDirs) && !fs.existsSync(currentRecentDirs)) {
        fs.copyFileSync(legacyRecentDirs, currentRecentDirs);
        console.log('[SettingsManager] Migrated recent directories from legacy app');
      }

      // Migrate history database
      const legacyHistory = path.join(legacyUserData, 'history.db');
      const currentHistory = path.join(currentUserData, 'history.db');
      if (fs.existsSync(legacyHistory) && !fs.existsSync(currentHistory)) {
        fs.copyFileSync(legacyHistory, currentHistory);
        console.log('[SettingsManager] Migrated history database from legacy app');
      }

      // Migrate RLM database
      const legacyRlm = path.join(legacyUserData, 'rlm.db');
      const currentRlm = path.join(currentUserData, 'rlm.db');
      if (fs.existsSync(legacyRlm) && !fs.existsSync(currentRlm)) {
        fs.copyFileSync(legacyRlm, currentRlm);
        console.log('[SettingsManager] Migrated RLM database from legacy app');
      }

      console.log('[SettingsManager] Migration from claude-orchestrator complete');
    } catch (error) {
      console.warn('[SettingsManager] Migration failed (non-critical):', error);
    }
  }

  /**
   * Get all settings
   */
  getAll(): AppSettings {
    return this.store.store;
  }

  /**
   * Get a single setting value
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.store.get(key);
  }

  /**
   * Set a single setting value
   */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.store.set(key, value);
    this.emit('setting-changed', key, value);
    this.emit(`setting:${key}`, value);
  }

  /**
   * Update multiple settings at once
   */
  update(settings: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings]);
      this.emit('setting-changed', key, value);
    }
    this.emit('settings-updated', this.getAll());
  }

  /**
   * Reset all settings to defaults
   */
  reset(): void {
    this.store.clear();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      this.store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings]);
    }
    this.emit('settings-reset', DEFAULT_SETTINGS);
  }

  /**
   * Reset a single setting to default
   */
  resetOne<K extends keyof AppSettings>(key: K): void {
    this.store.set(key, DEFAULT_SETTINGS[key]);
    this.emit('setting-changed', key, DEFAULT_SETTINGS[key]);
  }

  /**
   * Get the storage file path (useful for debugging)
   */
  getPath(): string {
    return this.store.path;
  }
}

// Singleton instance
let settingsManager: SettingsManager | null = null;

export function getSettingsManager(): SettingsManager {
  if (!settingsManager) {
    settingsManager = new SettingsManager();
  }
  return settingsManager;
}
