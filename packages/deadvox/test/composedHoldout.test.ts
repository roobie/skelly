import { createAuthoredGround } from '@skelly/engine/internal/core/authoredTerrainEvaluator.ts';
import { composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { makeConfig } from '@skelly/engine/internal/game/config.ts';
import { createWorldSetup } from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';

it.each([11, 73])('starts Holdout through the composed-site factory with every wave resolved (seed %s)', (seed) => {
  const content = startupContent();
  const scenario = content.registry.scenarios.get('holdout');
  expect(scenario?.kind).toBe('composedSite');
  if (scenario?.kind !== 'composedSite') {
    throw new Error('Holdout needs a composed scenario');
  }
  const config = { ...makeConfig(seed, 32, content), startId: 'holdout', site: scenario.id };
  const setup = createWorldSetup(
    config,
    new ChunkMeshes(config.scale.blockSize, content.registry),
    quietMesherSource(),
  );
  const site = setup.site!;
  expect(site).toBeDefined();
  const composed = composeLayout(seed, content.registry, scenario);
  expect(site.spawn.pos).toEqual(composed.layout.player.position);
  expect(site.authoredPlacements?.length).toBe(scenario.asks.length);
  expect(scenario.eventRules.length).toBeGreaterThan(1);
  expect(site.eventRules?.length).toBe(scenario.eventRules.length);
  expect(site.eventRules).toEqual(composed.eventRules);
  expect(setup.scenario?.eventRules).toEqual(composed.eventRules);
  if (site.terrain?.kind !== 'authored') {
    throw new Error('Composed sites consume authored terrain');
  }
  const ground = createAuthoredGround(site.terrain.ground);
  for (const rule of site.eventRules!) {
    expect(rule.effects.length).toBeGreaterThan(0);
    for (const effect of rule.effects) {
      expect(Object.values(composed.anchors)).toContainEqual(effect.at);
      const [x, y, z] = effect.at;
      expect(y).toBe(ground.height(x, z, scenario.ground * 2) + 1);
    }
  }
});
