import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RLMSession, ContextQueryResult } from '../../shared/types/rlm.types';

// ---------------------------------------------------------------------------
// Module mocks — must appear before any import that transitively loads Electron
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => '/tmp/test-orchestrator',
    isReady: () => true,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

vi.mock('electron-store', () => {
  return {
    default: class MockElectronStore {
      private data: Record<string, unknown> = {};
      get(key: string, defaultValue?: unknown) { return this.data[key] ?? defaultValue; }
      set(key: string, value: unknown) { this.data[key] = value; }
      clear() { this.data = {}; }
      get store() { return this.data; }
      path = '/tmp/test-store.json';
    },
  };
});

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      prepare() { return { run: vi.fn(), get: vi.fn(), all: vi.fn() }; }
      close() {}
    },
  };
});

// ---------------------------------------------------------------------------
// Import under test (after mocks are in place)
// ---------------------------------------------------------------------------

import { SmartCompactionManager, MaskingResult } from './smart-compaction';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<RLMSession> = {}): RLMSession {
  return {
    id: 'session-test',
    storeId: 'store-1',
    instanceId: 'instance-1',
    queries: [],
    recursiveCalls: [],
    totalRootTokens: 0,
    totalSubQueryTokens: 0,
    estimatedDirectTokens: 0,
    tokenSavingsPercent: 0,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function makeToolOutputQuery(_turn: number, toolName = 'grep', content = 'some tool output result'): ContextQueryResult {
  return {
    query: { type: 'grep', params: { toolName } },
    result: `Tool output: ${content}`,
    tokensUsed: 200,
    sectionsAccessed: [],
    duration: 10,
    depth: 0,
  };
}

function makeMessageQuery(content = 'a plain message'): ContextQueryResult {
  return {
    query: { type: 'semantic_search', params: {} },
    result: content,
    tokensUsed: 50,
    sectionsAccessed: [],
    duration: 5,
    depth: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmartCompactionManager.maskStaleToolOutputs', () => {
  let manager: SmartCompactionManager;

  beforeEach(() => {
    // SmartCompactionManager is a singleton — destroy any existing instance before each test
    try {
      SmartCompactionManager.getInstance().destroy();
    } catch {
      // May not exist yet on first run
    }
    manager = SmartCompactionManager.getInstance();
  });

  afterEach(() => {
    try {
      manager.destroy();
    } catch {
      // Ignore
    }
  });

  it('masks tool outputs older than threshold, preserving recent ones', () => {
    // 10 queries total; threshold = 3, so indices 0-6 (< 7) are candidates
    const queries: ContextQueryResult[] = Array.from({ length: 10 }, (_, i) =>
      makeToolOutputQuery(i)
    );
    const session = makeSession({ queries });

    const result: MaskingResult = manager.maskStaleToolOutputs(session, 3);

    expect(result.maskedCount).toBe(7);
    expect(result.tokensFreed).toBeGreaterThan(0);

    // All masked queries should contain the placeholder text
    for (let i = 0; i < 7; i++) {
      expect(session.queries[i]!.result).toMatch(/\[Tool output masked:/);
    }

    // The 3 most recent queries (indices 7, 8, 9) should be untouched
    for (let i = 7; i < 10; i++) {
      expect(session.queries[i]!.result).toMatch(/^Tool output:/);
    }
  });

  it('returns zero maskedCount when no tool outputs are old enough', () => {
    // Only 2 queries, threshold = 5 — nothing qualifies (candidateUntil <= 0)
    const queries: ContextQueryResult[] = [makeToolOutputQuery(0), makeToolOutputQuery(1)];
    const session = makeSession({ queries });

    const result = manager.maskStaleToolOutputs(session, 5);

    expect(result.maskedCount).toBe(0);
    expect(result.tokensFreed).toBe(0);
  });

  it('includes tool name and token count in the placeholder', () => {
    // 6 queries; threshold = 2, candidateUntil = 4, so indices 0-3 are candidates
    const queries: ContextQueryResult[] = Array.from({ length: 6 }, (_, i) =>
      makeToolOutputQuery(i, 'grep')
    );
    queries[0]!.tokensUsed = 350;
    const session = makeSession({ queries });

    manager.maskStaleToolOutputs(session, 2);

    const masked = session.queries[0]!.result;
    // Must mention the turn number
    expect(masked).toMatch(/turn 0/);
    // Must mention original token count
    expect(masked).toMatch(/350 tokens freed/);
  });

  it('never masks message-type results', () => {
    // 3 queries: messages at 0 and 1, tool output at 2.
    // threshold = 2, candidateUntil = 1 — only index 0 is a candidate, and it is a message.
    const queries: ContextQueryResult[] = [
      makeMessageQuery('message at turn 0'),
      makeMessageQuery('message at turn 1'),
      makeToolOutputQuery(2),
    ];
    const session = makeSession({ queries });

    const result = manager.maskStaleToolOutputs(session, 2);

    // The message query at index 0 should NOT be masked
    expect(session.queries[0]!.result).toBe('message at turn 0');
    expect(result.maskedCount).toBe(0);
  });

  it('emits tool_outputs_cleared event when masking occurs', () => {
    const queries: ContextQueryResult[] = Array.from({ length: 5 }, (_, i) =>
      makeToolOutputQuery(i)
    );
    const session = makeSession({ queries });

    const emitted: unknown[] = [];
    manager.on('tool_outputs_cleared', (event) => emitted.push(event));

    manager.maskStaleToolOutputs(session, 2);

    expect(emitted).toHaveLength(1);
    const event = emitted[0] as { type: string; sessionId: string; count: number; tokensSaved: number };
    expect(event.type).toBe('tool_outputs_cleared');
    expect(event.sessionId).toBe('session-test');
    expect(event.count).toBeGreaterThan(0);
    expect(event.tokensSaved).toBeGreaterThan(0);
  });

  it('does not emit event when nothing is masked', () => {
    const session = makeSession({ queries: [makeToolOutputQuery(0)] });

    const emitted: unknown[] = [];
    manager.on('tool_outputs_cleared', (event) => emitted.push(event));

    manager.maskStaleToolOutputs(session, 5);

    expect(emitted).toHaveLength(0);
  });
});
