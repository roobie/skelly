import { deepStrictEqual } from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { expect, it } from 'vitest';
import { buildBundledContent } from '../src/product/content.ts';
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

it('deserializes a fresh copy for each startup content and base registry call', () => {
  const originalStartup = startupContent();
  const startup = startupContent();
  expect(startup.registry.blocks.length).toBeGreaterThan(0);
  startup.registry.blocks[0]!.name = 'fixture-mutated-startup-block';
  startup.registry.items.clear();
  (startup.origins as Map<string, unknown>).clear();
  startup.issues.push({ source: 'fixture', path: '', message: 'fixture mutation' });
  expect(isDeepStrictEqual(startupContent(), originalStartup)).toBe(true);

  const originalRegistry = baseRegistry();
  const registry = baseRegistry();
  expect(registry).not.toBe(originalRegistry);
  registry.blocks[0]!.name = 'fixture-mutated-block';
  registry.blockIds.set('fixture-added-block', registry.blocks.length);
  registry.items.clear();
  deepStrictEqual(baseRegistry(), originalRegistry);
});
