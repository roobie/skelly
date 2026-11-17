import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deserialize } from 'node:v8';
import { expect, it, vi } from 'vitest';
import type { TestProject } from 'vitest/node';
import { setup } from './baseRegistrySetup.ts';

const fixture = vi.hoisted(() => ({ revision: 0 }));
vi.mock('@skelly/engine/internal/core/content.ts', () => ({
  buildRegistry: () => ({ issues: [], registry: fixture }),
}));

it('keeps snapshots and cleanup isolated between runs, including watch reruns', async () => {
  const first = { provide: vi.fn<TestProject['provide']>(), onTestsRerun: vi.fn<TestProject['onTestsRerun']>() };
  const second = { provide: vi.fn<TestProject['provide']>(), onTestsRerun: vi.fn<TestProject['onTestsRerun']>() };
  const cleanups: unknown[] = [];
  try {
    const readBaseSources = () => [{ source: 'fixture-base', data: {} }];
    const readStartupSources = () => [{ source: 'fixture-startup', data: {} }];
    const readLookSources = () => [{ source: 'fixture-look', data: { revision: fixture.revision } }];
    cleanups.push(
      setup(first, readBaseSources, readStartupSources, readLookSources),
      setup(second, readBaseSources, readStartupSources, readLookSources),
    );
    const [, firstPath] = first.provide.mock.calls[0]!;
    const [, secondPath] = second.provide.mock.calls[0]!;
    expect(dirname(firstPath)).not.toBe(dirname(secondPath));
    const [, firstStartupPath] = first.provide.mock.calls.find(([key]) => key === 'startupContentPath')!;
    const [, secondStartupPath] = second.provide.mock.calls.find(([key]) => key === 'startupContentPath')!;
    expect(dirname(firstStartupPath)).toBe(dirname(firstPath));
    expect(dirname(secondStartupPath)).toBe(dirname(secondPath));
    const [, firstLookPath] = first.provide.mock.calls.find(([key]) => key === 'wearSlotsLookRegistryPath')!;
    const [, secondLookPath] = second.provide.mock.calls.find(([key]) => key === 'wearSlotsLookRegistryPath')!;
    expect(dirname(firstLookPath)).toBe(dirname(firstPath));
    expect(dirname(secondLookPath)).toBe(dirname(secondPath));
    const snapshot = readFileSync(secondPath);
    const startupSnapshot = readFileSync(secondStartupPath);
    const lookSnapshot = readFileSync(secondLookPath);
    fixture.revision += 1;
    await first.onTestsRerun.mock.calls[0]![0]([]);
    expect(deserialize(readFileSync(firstPath))).toEqual(fixture);
    expect(deserialize(readFileSync(firstStartupPath)).registry).toEqual(fixture);
    expect(deserialize(readFileSync(firstLookPath))).toEqual(fixture);
    for (const cleanup of cleanups) {
      expect(cleanup).toBeTypeOf('function');
    }
    (cleanups.shift() as () => void)();
    expect(existsSync(dirname(firstPath))).toBe(false);
    expect(readFileSync(secondPath)).toEqual(snapshot);
    expect(readFileSync(secondStartupPath)).toEqual(startupSnapshot);
    expect(readFileSync(secondLookPath)).toEqual(lookSnapshot);
  } finally {
    for (const cleanup of cleanups) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    }
  }
});
