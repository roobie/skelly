import { deepStrictEqual } from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { expect, it } from 'vitest';
import { buildBundledContent } from '../src/game/bundledContent.ts';
import { baseRegistry, startupContent } from './baseRegistry.ts';

// The one deliberate full content build in the suite: the cache must hold what production builds. The
// round trip itself is checked once per run in `baseRegistrySetup.ts`. The timeout is sized to that build.
const FULL_BUILD_TIMEOUT_MS = 20_000;

it(
  'restores bundled startup admission including origins',
  () => {
    const built = buildBundledContent();
    expect(built.issues).toEqual([]);
    expect(isDeepStrictEqual(startupContent(), built)).toBe(true);
    expect(built.origins.size).toBeGreaterThan(0);
  },
  FULL_BUILD_TIMEOUT_MS,
);

it('isolates each startup content caller from another caller’s mutations', () => {
  const original = startupContent();
  const first = startupContent();
  first.registry.blocks[0]!.name = 'fixture-mutated-startup-block';
  first.registry.items.clear();
  (first.origins as Map<string, unknown>).clear();
  first.issues.push({ source: 'fixture', path: '', message: 'fixture mutation' });
  expect(isDeepStrictEqual(startupContent(), original)).toBe(true);
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
