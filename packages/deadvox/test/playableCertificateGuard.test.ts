import { expect, it } from 'vitest';
import type { CitySite } from '../src/core/citySite.ts';
import {
  scenarioCertificate,
  scenarioLotResourceCertificate,
  scenarioStartCertificate,
} from '../src/core/scenarioCertificate.ts';
import { baseRegistry } from './baseRegistry.ts';

// The full city cases live in the slow certificate file; this stub keeps the fail-closed guard in the default run.
it('fails every playable-run certificate closed at the missing start without building a world', () => {
  const site = {
    registry: baseRegistry(),
    placements: [],
    seed: 0,
    surface: undefined,
    plan: { composition: {}, service: {}, portal: {} },
  } as unknown as CitySite;
  for (const certify of [scenarioCertificate, scenarioStartCertificate, scenarioLotResourceCertificate]) {
    expect(certify(site).issues.map(([path]) => path)).toEqual(['.composition.start']);
  }
});
