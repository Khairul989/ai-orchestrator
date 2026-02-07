/**
 * Electron Shim - Mocks Electron APIs for headless orchestrator benchmarking
 *
 * This MUST be loaded before any orchestrator code that imports from 'electron'.
 * It registers mock modules in require.cache so that `require('electron')`
 * and `require('electron-store')` return lightweight in-memory implementations.
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

// Create a unique temp directory for this benchmark process
const BASE_DIR = path.join(os.tmpdir(), 'orchestrator-benchmark', String(process.pid));
const USER_DATA_DIR = path.join(BASE_DIR, 'userData');

// Ensure directories exist eagerly (orchestrator code assumes they do)
const dirs = [
  USER_DATA_DIR,
  path.join(USER_DATA_DIR, 'logs'),
  path.join(USER_DATA_DIR, 'output-storage'),
  path.join(USER_DATA_DIR, 'child-results'),
  path.join(USER_DATA_DIR, 'conversation-history'),
];

for (const dir of dirs) {
  fs.mkdirSync(dir, { recursive: true });
}

// ============================================
// Mock: electron
// ============================================

const electronMock = {
  app: {
    getPath(name) {
      switch (name) {
        case 'userData':
        case 'appData':
          return USER_DATA_DIR;
        case 'home':
          return os.homedir();
        case 'temp':
          return os.tmpdir();
        case 'logs':
          return path.join(USER_DATA_DIR, 'logs');
        default:
          return USER_DATA_DIR;
      }
    },
    getName() { return 'orchestrator-benchmark'; },
    getVersion() { return '0.0.0-benchmark'; },
    isReady() { return true; },
    whenReady() { return Promise.resolve(); },
    on() { return this; },
    once() { return this; },
    removeListener() { return this; },
    removeAllListeners() { return this; },
    emit() { return false; },
    isPackaged: false,
  },
  ipcMain: {
    handle() {},
    on() { return this; },
    once() { return this; },
    removeHandler() {},
    removeListener() { return this; },
    removeAllListeners() { return this; },
  },
  BrowserWindow: class BrowserWindow {
    constructor() {
      this.webContents = { send() {}, on() { return this; } };
    }
    loadURL() {}
    on() { return this; }
  },
  dialog: {
    showOpenDialog() { return Promise.resolve({ canceled: true, filePaths: [] }); },
    showSaveDialog() { return Promise.resolve({ canceled: true }); },
    showMessageBox() { return Promise.resolve({ response: 0 }); },
  },
  shell: {
    openExternal() { return Promise.resolve(); },
    openPath() { return Promise.resolve(''); },
  },
};

// ============================================
// Mock: electron-store
// ============================================

/**
 * In-memory replacement for electron-store.
 * Implements the Store<T> interface used by SettingsManager.
 */
class ElectronStoreMock {
  constructor(options = {}) {
    this.store = options.defaults ? { ...options.defaults } : {};
    this.path = path.join(USER_DATA_DIR, `${options.name || 'store'}.json`);
  }

  get(key) {
    return this.store[key];
  }

  set(keyOrObject, value) {
    if (typeof keyOrObject === 'string') {
      this.store[keyOrObject] = value;
    } else if (typeof keyOrObject === 'object' && keyOrObject !== null) {
      Object.assign(this.store, keyOrObject);
    }
  }

  has(key) {
    return key in this.store;
  }

  delete(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  get size() {
    return Object.keys(this.store).length;
  }

  onDidChange() {
    return () => {}; // unsubscribe function
  }

  onDidAnyChange() {
    return () => {};
  }
}

// ============================================
// Register mocks in require.cache
// ============================================

// Find the actual module paths that require() would resolve to
function registerMock(moduleName, mockExports) {
  try {
    const resolvedPath = require.resolve(moduleName);
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      children: [],
      paths: [],
      exports: mockExports,
    };
  } catch {
    // Module not installed - create a virtual entry
    // Use a fake path that won't conflict
    const fakePath = path.join(__dirname, `__mock_${moduleName}.js`);
    require.cache[fakePath] = {
      id: fakePath,
      filename: fakePath,
      loaded: true,
      children: [],
      paths: [],
      exports: mockExports,
    };

    // Also register by module name for direct resolution
    const Module = require('module');
    const originalResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...args) {
      if (request === moduleName) {
        return fakePath;
      }
      return originalResolve.call(this, request, ...args);
    };
  }
}

// Register both mocks
registerMock('electron', electronMock);
registerMock('electron-store', ElectronStoreMock);

// Export for direct use if needed
module.exports = {
  electronMock,
  ElectronStoreMock,
  BASE_DIR,
  USER_DATA_DIR,
  cleanup() {
    try {
      fs.rmSync(BASE_DIR, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  },
};
