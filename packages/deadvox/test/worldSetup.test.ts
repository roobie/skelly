import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import type { ScenarioCitySite } from '@skelly/engine/internal/core/scenarioCity.ts';
import { configFromUrl as readConfig } from '@skelly/engine/session';
import { createWorldSetup, makeScale, playerStartFromWorld, siteForReviewMap } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { ChunkMeshes } from '../src/presentation/entries/render.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { makeAttemptLayout } from './fixtures/attemptPolicy.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';
import { composedFixture, fixtureStart, fixtureStartRow } from './fixtures/scenario.ts';
import { configFromUrl } from './fixtures/startupContent.ts';

it('selects the active authored layout policy and supplies none for a rowless diagnostic site', () => {
  const original = configFromUrl(new URLSearchParams());
  const layout = makeAttemptLayout();
  const start = {
    ...original.content.registry.starts.get(original.startId)!,
    id: 'fixture_policy_start',
    site: layout.id,
    defaultForSite: true as const,
  };
  const registry = {
    ...original.content.registry,
    layouts: new Map([[layout.id, layout]]),
    starts: new Map([...original.content.registry.starts, [start.id, start]]),
  };
  const content = { ...original.content, registry };
  const setup = (params: string) => {
    const config = readConfig(new URLSearchParams(params), content, ragdollSweepViewer);
    return createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry), quietMesherSource());
  };
  expect(setup(`site=${layout.id}`).attemptPolicy).toEqual(layout.attemptPolicy);
  registry.layouts.set(layout.id, { ...layout, attemptPolicy: undefined });
  expect(setup(`site=${layout.id}`).attemptPolicy).toBeUndefined();
  expect(setup('site=weatheringTest&debug=1').attemptPolicy).toBeUndefined();
});

it('builds authored rows unchanged by a debug profile, including a fixture named testHouse', () => {
  const original = configFromUrl(new URLSearchParams());
  const layout = { ...makeAttemptLayout(), id: 'testHouse' };
  const registry = { ...original.content.registry, layouts: new Map([[layout.id, layout]]) };
  for (const debug of [false, true]) {
    const site = siteForReviewMap({ ...original, site: layout.id, debug }, registry);
    expect(site).toBeInstanceOf(AuthoredSite);
    expect(site!.spawn).toEqual({ pos: layout.player.position, yaw: 0 });
  }
});

describe('selected start on a composed scenario', () => {
  const near = fixtureStartRow(fixtureStart(), { id: 'fixture_near_start' });
  const { defaultForSite: _default, ...far } = fixtureStartRow(
    { ...fixtureStart(), cell: [-1, -1], spawn: [3, 7, 2] },
    { id: 'fixture_far_start' },
  );
  const { profile, registry } = composedFixture([near, far]);
  const original = configFromUrl(new URLSearchParams());
  const build = (startId: string) => siteForReviewMap({ ...original, site: profile.id, startId }, registry);

  it('places each selected start by its own row, not by the site default', () => {
    const [nearPlan, farPlan] = [near, far].map(({ id }) => (build(id) as ScenarioCitySite).plan);
    expect(nearPlan!.candidates).not.toContainEqual(near.placement!.cell);
    expect(nearPlan!.candidates).toContainEqual(far.placement!.cell);
    expect(farPlan!.candidates).not.toContainEqual(far.placement!.cell);
    expect(farPlan!.candidates).toContainEqual(near.placement!.cell);
    expect(farPlan!.spawn).toEqual(farPlan!.composition!.start!.spawn);
    expect(nearPlan!.spawn).not.toEqual(farPlan!.spawn);
  });

  it('refuses an absent start and a start that names another site', () => {
    const elsewhere = fixtureStartRow(null, { id: 'fixture_elsewhere_start', site: 'testHouse' });
    const mixed = { ...registry, starts: new Map([...registry.starts, [elsewhere.id, elsewhere]]) };
    for (const startId of ['fixture_absent_start', elsewhere.id]) {
      expect(() => siteForReviewMap({ ...original, site: profile.id, startId }, mixed)).toThrow(
        'does not start on site',
      );
    }
  });
});

describe('player start from world setup', () => {
  it('converts the generated metre-space spawn to a block-space body origin', () => {
    const start = playerStartFromWorld({ spawn: { pos: [12, 6, -3], yaw: 1.25 }, groundAt: () => 0 }, makeScale(0.5));
    expect(start).toEqual({ position: [24, 12.01, -6], yaw: 1.25 });
  });

  it('keeps debug x/z/yaw starts grounded and limited to fresh debug sessions', () => {
    const scale = makeScale(0.5);
    const setup = {
      spawn: { pos: [4, 7, 9] as [number, number, number], yaw: 0.25 },
      groundAt: (x: number, z: number) => x / 4 + z / 8,
    };
    const debugConfig = configFromUrl(new URLSearchParams('debug=1&at=12.5,-7.25,90'));
    const start = playerStartFromWorld(setup, scale, debugConfig.debugStart);
    expect(start.position).toEqual([25, setup.groundAt(12.5, -7.25) / scale.blockSize + 0.01, -14.5]);
    expect(start.yaw).toBeCloseTo(Math.PI / 2);

    const noYawConfig = configFromUrl(new URLSearchParams('debug=1&at=12.5,-7.25'));
    expect(playerStartFromWorld(setup, scale, noYawConfig.debugStart).yaw).toBe(setup.spawn.yaw);

    const normalConfig = configFromUrl(new URLSearchParams('at=12.5,-7.25,90'));
    expect(normalConfig.debugStart).toBeUndefined();
    const worldSpawn = { position: [8, 14.01, 18], yaw: 0.25 };
    expect(playerStartFromWorld(setup, scale, normalConfig.debugStart)).toEqual(worldSpawn);
    expect(playerStartFromWorld(setup, scale, debugConfig.debugStart, { restoring: true })).toEqual(worldSpawn);
  });
});
