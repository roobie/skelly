import { siteForReviewMap } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { makeConfig } from './fixtures/startupContent.ts';
import { terrainFor } from './fixtures/terrain.ts';

it('preserves authored lake water when debug staging wraps the site', () => {
  const config = makeConfig(13, 64);
  config.site = 'testHouse';
  const { registry } = config.content;
  const house = siteForReviewMap(config, registry)!;
  config.debug = true;
  const staged = siteForReviewMap(config, registry)!;
  const basins = registry.layouts.get(config.site)!.terrain.filter((feature) => feature.kind === 'basin');
  expect(basins.length).toBeGreaterThan(0);
  const samples = basins.map(({ centre }) => centre.map((value) => Math.floor(value / config.scale.blockSize)));
  const water = samples.map(([x, z]) =>
    terrainFor(house, registry, config.scale, config.seed).surface!.water?.(x!, z!),
  );
  expect(water.some((column) => column !== undefined)).toBe(true);
  expect(
    samples.map(([x, z]) => terrainFor(staged, registry, config.scale, config.seed).surface!.water?.(x!, z!)),
  ).toEqual(water);
});
