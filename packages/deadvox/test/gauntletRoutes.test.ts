import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import { scenarioCertificate } from '../src/core/scenarioCertificate.ts';
import { ScenarioCitySite } from '../src/core/scenarioCity.ts';
import { startupContent } from './baseRegistry.ts';
import { defaultStartOf } from './fixtures/scenario.ts';

// Play doesn't prove the route before Go, so these tests stand in for that proof: the certificate's issues cover
// every entrance, crossing, resource and the lab terminal. See `packages/deadvox/DESIGN.md`, "Gauntlet".
const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const gauntlets = [...registry.scenarios.values()].filter((scenario) => scenario.kind === 'assembledCity');
if (gauntlets.length === 0) {
  throw new Error('No bundled gauntlet to certify');
}
// Seed 1 is the launcher's default; 73 is the seed the city plan tests build.
const FIXED_SEEDS = [1, 73];
const SWEEP_SEEDS = Array.from({ length: 24 }, (_, index) => 1000 + index * 7919);

const issuesOf = (seed: number) =>
  gauntlets.flatMap((scenario) =>
    scenarioCertificate(
      new ScenarioCitySite({ seed, registry, scale, scenario, start: defaultStartOf(registry, scenario) }),
    ).issues.map(([path, message]) => `${scenario.id} seed ${seed} ${path}: ${message}`),
  );

describe('gauntlet route certificate', () => {
  it.each(FIXED_SEEDS)('certifies every bundled gauntlet finishable at seed %i', (seed) => {
    expect(issuesOf(seed)).toEqual([]);
  });

  it('certifies every bundled gauntlet finishable across a seed sweep', () => {
    expect(SWEEP_SEEDS.flatMap(issuesOf)).toEqual([]);
  });
});
