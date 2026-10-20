import { deepStrictEqual } from 'node:assert/strict';
import { beforeAll, expect, it, vi } from 'vitest';
import { BundleAdmission, type BundleStamp, bundleSourceHash } from '../src/core/bundleAdmission.ts';
// biome-ignore lint/performance/noNamespaceImport: the test spies on the live proof export used by admission.
import * as cityPlan from '../src/core/cityPlan.ts';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { baseSources } from '../src/game/bundledContent.ts';
import { stampBundle } from '../tools/stampBundle.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const proofHash = '1'.repeat(64);
let stamp: BundleStamp;
beforeAll(async () => {
  stamp = await stampBundle(baseSources, proofHash);
});

it('admits the same ordered bundled registry and origins without repeating the stamped proofs', async () => {
  const full = startupContent();
  const bundle = await BundleAdmission.prepare(baseSources, stamp, proofHash);
  expect(bundle).toBeDefined();
  const proof = vi.spyOn(cityPlan, 'scenarioPlanIssues');
  try {
    const trusted = buildRegistry(baseSources, { bundle });
    deepStrictEqual(trusted, full);
    expect(proof).not.toHaveBeenCalled();
  } finally {
    proof.mockRestore();
  }
});

it('re-proves the bundle whenever a mod is selected, even if the input itself is unchanged', async () => {
  const bundle = await BundleAdmission.prepare(baseSources, stamp, proofHash);
  expect(bundle).toBeDefined();
  const proof = vi.spyOn(cityPlan, 'scenarioPlanIssues');
  try {
    expect(buildRegistry(baseSources, { bundle, modsSelected: true }).issues).toEqual([]);
    expect(proof).toHaveBeenCalled();
  } finally {
    proof.mockRestore();
  }
});

it('falls back to full admission for missing, content-mismatched or proof-mismatched stamps', async () => {
  const scenario = fixtureScenario();
  scenario.serviceTemplate = 'fixture_missing_service';
  const sources = fixtureScenarioSources(scenario);
  expect(sources.flatMap(validateContent)).toEqual([]);
  const sourceHash = await bundleSourceHash(sources);
  const stamps = [undefined, { sourceHash: '0'.repeat(64), proofHash }, { sourceHash, proofHash: '2'.repeat(64) }];
  const bundles = await Promise.all(stamps.map((candidate) => BundleAdmission.prepare(sources, candidate, proofHash)));
  for (const bundle of bundles) {
    expect(bundle).toBeUndefined();
    const rejected = buildRegistry(sources, { bundle });
    expect(rejected.issues.some((issue) => issue.path.endsWith('.serviceTemplate'))).toBe(true);
    expect(rejected.registry.scenarios.has(scenario.id)).toBe(false);
  }
  await expect(stampBundle(sources, proofHash)).rejects.toThrow('Bundle validation failed');
});

it('does not reuse matched admission after sources are changed or an empty mod is appended', async () => {
  const sources = [...structuredClone(baseSources)];
  const bundle = await BundleAdmission.prepare(sources, stamp, proofHash);
  expect(bundle).toBeDefined();
  expect(bundle!.matches([...sources].reverse())).toBe(false);
  const appended = [...sources, { source: 'fixture-empty-mod.json', data: {} }];
  expect(bundle!.matches(appended)).toBe(false);
  const changed = [...structuredClone(baseSources)];
  changed[0] = { ...changed[0]!, data: { ...((changed[0]!.data ?? {}) as object), fixture: true } };
  expect(bundle!.matches(changed)).toBe(false);
  sources[0] = { ...sources[0]!, source: 'fixture-renamed.json' };
  expect(bundle!.matches(sources)).toBe(false);
});
