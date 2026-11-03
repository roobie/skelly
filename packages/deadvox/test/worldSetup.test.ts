import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { makeScale } from '../src/core/scale.ts';
import { configFromUrl as readConfig } from '../src/game/config.ts';
import { createWorldSetup, playerStartFromWorld, siteForReviewMap } from '../src/game/worldSetup.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { makeAttemptLayout } from './fixtures/attemptPolicy.ts';
import { configFromUrl } from './fixtures/startupContent.ts';

afterEach(() => vi.unstubAllGlobals());

it('selects the active authored layout policy and supplies none for a rowless diagnostic site', () => {
  vi.stubGlobal(
    'Worker',
    class {
      postMessage = vi.fn();
    },
  );
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
    const config = readConfig(new URLSearchParams(params), content);
    return createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry));
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
