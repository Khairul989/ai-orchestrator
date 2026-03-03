import { describe, expect, it } from 'vitest';
import {
  InstanceCreatePayloadSchema,
  InstanceCreateWithMessagePayloadSchema,
} from './ipc-schemas';

describe('IPC provider schema parity', () => {
  const canonicalProviders = ['auto', 'claude', 'codex', 'gemini', 'copilot'] as const;

  it('accepts the same canonical provider set for create and create-with-message', () => {
    for (const provider of canonicalProviders) {
      const createResult = InstanceCreatePayloadSchema.safeParse({
        workingDirectory: '/tmp/project',
        provider,
      });
      const createWithMessageResult = InstanceCreateWithMessagePayloadSchema.safeParse({
        workingDirectory: '/tmp/project',
        message: 'hello',
        provider,
      });

      expect(createResult.success).toBe(true);
      expect(createWithMessageResult.success).toBe(true);
    }
  });

  it('rejects legacy openai provider alias at runtime IPC boundaries', () => {
    const createResult = InstanceCreatePayloadSchema.safeParse({
      workingDirectory: '/tmp/project',
      provider: 'openai',
    });
    const createWithMessageResult = InstanceCreateWithMessagePayloadSchema.safeParse({
      workingDirectory: '/tmp/project',
      message: 'hello',
      provider: 'openai',
    });

    expect(createResult.success).toBe(false);
    expect(createWithMessageResult.success).toBe(false);
  });
});
