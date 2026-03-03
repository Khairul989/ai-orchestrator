import { describe, expect, it, vi } from 'vitest';
import { CodexCliAdapter } from './codex-cli-adapter';

describe('CodexCliAdapter context usage', () => {
  it('reports vision as unsupported in orchestrator mode', () => {
    const adapter = new CodexCliAdapter();
    const capabilities = adapter.getCapabilities();
    expect(capabilities.vision).toBe(false);
  });

  it('rejects attachments in orchestrator mode', async () => {
    const adapter = new CodexCliAdapter();
    const sendMessageSpy = vi.spyOn(adapter, 'sendMessage');

    await adapter.spawn();
    await expect(
      adapter.sendInput('hello', [
        {
          name: 'image.png',
          type: 'image/png',
          path: '/tmp/image.png',
        },
      ])
    ).rejects.toThrow('does not support attachments');

    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('emits current-turn usage instead of cumulative usage', async () => {
    const adapter = new CodexCliAdapter();
    const contextEvents: Array<{ used: number; total: number; percentage: number }> = [];

    adapter.on('context', (usage) => {
      contextEvents.push(usage);
    });

    const sendMessageSpy = vi.spyOn(adapter, 'sendMessage');
    sendMessageSpy
      .mockResolvedValueOnce({
        id: 'resp-1',
        role: 'assistant',
        content: 'ok',
        usage: { inputTokens: 49772, outputTokens: 20, totalTokens: 49792 },
      })
      .mockResolvedValueOnce({
        id: 'resp-2',
        role: 'assistant',
        content: 'ok',
        usage: { inputTokens: 49772, outputTokens: 39, totalTokens: 49811 },
      });

    await adapter.spawn();
    await adapter.sendInput('Reply with exactly: ok');
    await adapter.sendInput('Reply with exactly: ok');

    expect(contextEvents).toHaveLength(2);
    expect(contextEvents[0].used).toBe(49792);
    expect(contextEvents[1].used).toBe(49811);
    expect(contextEvents[1].used).not.toBe(99603);
  });

  it('falls back to totalTokens when input/output breakdown is unavailable', async () => {
    const adapter = new CodexCliAdapter();
    const onContext = vi.fn();
    adapter.on('context', onContext);

    vi.spyOn(adapter, 'sendMessage').mockResolvedValue({
      id: 'resp-1',
      role: 'assistant',
      content: 'ok',
      usage: { totalTokens: 1234 },
    });

    await adapter.spawn();
    await adapter.sendInput('test');

    expect(onContext).toHaveBeenCalledTimes(1);
    const usage = onContext.mock.calls[0][0] as { used: number; total: number; percentage: number };
    expect(usage.used).toBe(1234);
    expect(usage.total).toBe(128000);
  });
});
