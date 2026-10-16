import { deepStrictEqual } from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { baseRegistry } from './baseRegistry.ts';

it('restores the complete validated base registry without changing its data', () => {
  const directory = 'src/content/base';
  const built = buildRegistry(
    readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown })),
  );
  expect(built.issues).toEqual([]);
  deepStrictEqual(baseRegistry(), built.registry);
});

it('isolates nested content mutations and map edits from other fixture callers', () => {
  const first = baseRegistry();
  const second = baseRegistry();
  const original = structuredClone(second);
  expect(first === second).toBe(false);
  expect(first.blocks.length).toBeGreaterThan(0);
  first.blocks[0]!.name = 'fixture-mutated-block';
  first.blockIds.set('fixture-added-block', first.blocks.length);
  first.items.clear();
  expect(second.blocks[0]!.name).toBe(original.blocks[0]!.name);
  expect(second.blockIds.has('fixture-added-block')).toBe(false);
  expect(second.items.size).toBe(original.items.size);
  deepStrictEqual(second, original);
  deepStrictEqual(baseRegistry(), original);
});
