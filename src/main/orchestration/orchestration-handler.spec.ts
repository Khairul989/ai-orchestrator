import { describe, expect, it, vi } from 'vitest';

// Mock the logger before any imports that transitively pull in Electron's app.getPath
vi.mock('../logging/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { OrchestrationHandler } from './orchestration-handler';

describe('OrchestrationHandler.processOutput (streaming markers)', () => {
  it('emits a user-action request when the marker block is split across chunks', () => {
    const orchestration = new OrchestrationHandler();
    orchestration.registerInstance('i-1', '/tmp', null);

    const onUserAction = vi.fn();
    orchestration.on('user-action-request', onUserAction);

    const chunk1 = [
      'some assistant text',
      ':::ORCHESTRATOR_COMMAND:::',
      '{"action":"request_user_action","requestType":"select_option","title":"Pick","message":"Choose one","options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}',
      ''
    ].join('\n');

    const chunk2 = [':::END_COMMAND:::', 'more text'].join('\n');

    orchestration.processOutput('i-1', chunk1);
    expect(onUserAction).toHaveBeenCalledTimes(0);

    orchestration.processOutput('i-1', chunk2);
    expect(onUserAction).toHaveBeenCalledTimes(1);

    const pending = orchestration.getPendingUserActionsForInstance('i-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requestType).toBe('select_option');
    expect(pending[0]?.options?.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('handles the start marker itself being split across chunks', () => {
    const orchestration = new OrchestrationHandler();
    orchestration.registerInstance('i-2', '/tmp', null);

    const onUserAction = vi.fn();
    orchestration.on('user-action-request', onUserAction);

    // Split the start marker across chunks to ensure buffering keeps enough tail.
    const chunk1 = '...:::ORCHESTRATOR_COM';
    const chunk2 = [
      'MAND:::',
      '{"action":"request_user_action","requestType":"confirm","title":"Confirm","message":"Proceed?"}',
      ':::END_COMMAND:::'
    ].join('\n');

    orchestration.processOutput('i-2', chunk1);
    orchestration.processOutput('i-2', chunk2);

    expect(onUserAction).toHaveBeenCalledTimes(1);
    const pending = orchestration.getPendingUserActionsForInstance('i-2');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requestType).toBe('confirm');
    expect(pending[0]?.title).toBe('Confirm');
  });

  it('rejects malformed ask_questions commands without questions', () => {
    const orchestration = new OrchestrationHandler();
    orchestration.registerInstance('i-3', '/tmp', null);

    const onUserAction = vi.fn();
    orchestration.on('user-action-request', onUserAction);

    const malformed = [
      ':::ORCHESTRATOR_COMMAND:::',
      '{"action":"request_user_action","requestType":"ask_questions","title":"Clarify","message":"Please answer:"}',
      ':::END_COMMAND:::',
    ].join('\n');

    orchestration.processOutput('i-3', malformed);

    expect(onUserAction).toHaveBeenCalledTimes(0);
    expect(orchestration.getPendingUserActionsForInstance('i-3')).toHaveLength(0);
  });

  it('accepts valid ask_questions commands with explicit questions', () => {
    const orchestration = new OrchestrationHandler();
    orchestration.registerInstance('i-4', '/tmp', null);

    const onUserAction = vi.fn();
    orchestration.on('user-action-request', onUserAction);

    const valid = [
      ':::ORCHESTRATOR_COMMAND:::',
      '{"action":"request_user_action","requestType":"ask_questions","title":"Clarify","message":"Please answer:","questions":["Which panel first?","Do you prefer tabs or sections?"]}',
      ':::END_COMMAND:::',
    ].join('\n');

    orchestration.processOutput('i-4', valid);

    expect(onUserAction).toHaveBeenCalledTimes(1);
    const pending = orchestration.getPendingUserActionsForInstance('i-4');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requestType).toBe('ask_questions');
    expect(pending[0]?.questions).toEqual([
      'Which panel first?',
      'Do you prefer tabs or sections?',
    ]);
  });
});
