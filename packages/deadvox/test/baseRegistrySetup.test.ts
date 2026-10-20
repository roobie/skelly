import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deserialize } from 'node:v8';
import { expect, it, vi } from 'vitest';
import type { TestProject } from 'vitest/node';
import { setup } from './baseRegistrySetup.ts';

const fixture = vi.hoisted(() => ({ revision: 0 }));
vi.mock('../src/core/content.ts', () => ({
  buildRegistry: () => ({ issues: [], registry: fixture }),
}));

it('keeps snapshots and cleanup isolated between runs, including watch reruns', async () => {
  const first = { provide: vi.fn<TestProject['provide']>(), onTestsRerun: vi.fn<TestProject['onTestsRerun']>() };
  const second = { provide: vi.fn<TestProject['provide']>(), onTestsRerun: vi.fn<TestProject['onTestsRerun']>() };
  const cleanups: unknown[] = [];
  try {
    cleanups.push(setup(first), setup(second));
    const [, firstPath] = first.provide.mock.calls[0]!;
    const [, secondPath] = second.provide.mock.calls[0]!;
    expect(dirname(firstPath)).not.toBe(dirname(secondPath));
    const [, firstStartupPath] = first.provide.mock.calls.find(([key]) => key === 'startupContentPath')!;
    const [, secondStartupPath] = second.provide.mock.calls.find(([key]) => key === 'startupContentPath')!;
    expect(dirname(firstStartupPath)).toBe(dirname(firstPath));
    expect(dirname(secondStartupPath)).toBe(dirname(secondPath));
    const snapshot = readFileSync(secondPath);
    const startupSnapshot = readFileSync(secondStartupPath);
    fixture.revision += 1;
    await first.onTestsRerun.mock.calls[0]![0]([]);
    expect(deserialize(readFileSync(firstPath))).toEqual(fixture);
    expect(deserialize(readFileSync(firstStartupPath)).registry).toEqual(fixture);
    for (const cleanup of cleanups) {
      expect(cleanup).toBeTypeOf('function');
    }
    (cleanups.shift() as () => void)();
    expect(existsSync(dirname(firstPath))).toBe(false);
    expect(readFileSync(secondPath)).toEqual(snapshot);
    expect(readFileSync(secondStartupPath)).toEqual(startupSnapshot);
  } finally {
    for (const cleanup of cleanups) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    }
  }
});
