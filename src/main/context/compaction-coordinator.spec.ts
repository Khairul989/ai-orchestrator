import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactionCoordinator } from './compaction-coordinator';

describe('CompactionCoordinator strategy selection', () => {
  beforeEach(() => {
    CompactionCoordinator._resetForTesting();
  });

  it('uses native compaction when supported and successful', async () => {
    const coordinator = CompactionCoordinator.getInstance();
    const nativeCompact = vi.fn(async () => true);
    const restartCompact = vi.fn(async () => true);

    coordinator.configure({
      nativeCompact,
      restartCompact,
      supportsNativeCompaction: () => true,
    });

    const result = await coordinator.compactInstance('inst-native');

    expect(result.success).toBe(true);
    expect(result.method).toBe('native');
    expect(nativeCompact).toHaveBeenCalledTimes(1);
    expect(restartCompact).not.toHaveBeenCalled();
  });

  it('uses restart-with-summary when native compaction is not supported', async () => {
    const coordinator = CompactionCoordinator.getInstance();
    const nativeCompact = vi.fn(async () => true);
    const restartCompact = vi.fn(async () => true);

    coordinator.configure({
      nativeCompact,
      restartCompact,
      supportsNativeCompaction: () => false,
    });

    const result = await coordinator.compactInstance('inst-restart');

    expect(result.success).toBe(true);
    expect(result.method).toBe('restart-with-summary');
    expect(nativeCompact).not.toHaveBeenCalled();
    expect(restartCompact).toHaveBeenCalledTimes(1);
  });

  it('falls back to restart-with-summary when native compaction fails', async () => {
    const coordinator = CompactionCoordinator.getInstance();
    const nativeCompact = vi.fn(async () => false);
    const restartCompact = vi.fn(async () => true);

    coordinator.configure({
      nativeCompact,
      restartCompact,
      supportsNativeCompaction: () => true,
    });

    const result = await coordinator.compactInstance('inst-fallback');

    expect(result.success).toBe(true);
    expect(result.method).toBe('restart-with-summary');
    expect(nativeCompact).toHaveBeenCalledTimes(1);
    expect(restartCompact).toHaveBeenCalledTimes(1);
  });
});
