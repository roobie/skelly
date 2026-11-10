import { makeConfig } from '@skelly/engine/session';
import { heightFogUniforms } from '@skelly/presentation/internal/render/heightFog.ts';
import type { RenderedEngine } from '@skelly/presentation/play';
import { setHeightFogTuning } from '@skelly/presentation/render';
import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { benchFlareSourcesFromUrl } from '../src/bench/lightFixture.ts';
import { applyBenchWeathering, benchDraw } from '../src/bench/post.ts';
import { benchRunFromUrl } from '../src/bench/run.ts';
import { shamblerRunFromUrl } from '../src/bench/shamblers.ts';
import { baseRegistry, startupContent } from './baseRegistry.ts';
import { defaultWeatheringId, fixtureIds } from './fixtures/capabilityIds.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

const params = (query: string) => new URLSearchParams(query);

const registry = baseRegistry();

describe('benchmark weathering', () => {
  it('uses its own registry profile, not the play default, so retuning the default leaves the bench workload alone', () => {
    const config = makeConfig(1, 64, { ...startupContent(), registry });
    applyBenchWeathering(config);
    expect(config.weatheringProfileId).not.toBe(defaultWeatheringId);
    expect(config.weathering).toBeDefined();
    expect(config.weathering).toEqual(registry.weathering.get(config.weatheringProfileId));
  });
});

describe('benchmark post-processing option', () => {
  it('is off unless the hash turns post on, so the default benchmark renders as it always did', () => {
    const world = { layouts: new Map(), scenarios: new Map() };
    expect(benchRunFromUrl(params('bench=1'), {}, world).post).toBe(false);
    expect(benchRunFromUrl(params('bench=1'), { post: false }, world).post).toBe(false);
    expect(benchRunFromUrl(params('bench=1'), { post: true }, world).post).toBe(true);
    expect(benchRunFromUrl(params('bench=1'), {}, world).nightVision).toBe(false);
    expect(benchRunFromUrl(params('bench=1&nightVision=1'), {}, world).nightVision).toBe(true);
  });

  it('reads query-authored sources and rejects invalid placements', () => {
    const positions = [
      [0, 0, -2],
      [0.2, 0, -3],
    ];
    const query = params(`bench=1&flareSources=${JSON.stringify(positions)}`);
    expect(benchRunFromUrl(query, {}, { layouts: new Map(), scenarios: new Map() }).flareSources).toEqual(positions);
    expect(() => benchFlareSourcesFromUrl(params('flareSources=[[1,2]]'))).toThrow();
  });

  it('is read by both benchmark modes', () => {
    expect(shamblerRunFromUrl(params('bench=shamblers'), {})?.post).toBe(false);
    expect(shamblerRunFromUrl(params('bench=shamblers'), { post: true })?.post).toBe(true);
  });

  it.each([false, true])('initializes authored fog independently of prior play with post=%s', (post) => {
    const { registry: contentRegistry } = startupContent();
    const look = contentRegistry.look.get(fixtureIds.defaultLook)!;
    const fog = LOOK_FIXTURE.heightFog;
    const fixtureRegistry = {
      ...contentRegistry,
      look: new Map([[look.id, { ...LOOK_FIXTURE, id: look.id, capability: 'defaultLook' }]]),
    };
    setHeightFogTuning({ baseMetres: fog.baseMetres + 1, scaleMetres: fog.scaleMetres * 2 });
    const engine = {
      registry: fixtureRegistry,
      renderer: {},
      scene: {},
      camera: new PerspectiveCamera(),
      meshes: { setLinearColors: vi.fn(), setPatterns: vi.fn(), setOcclusion: vi.fn() },
      mood: { restore: vi.fn(), setSky: vi.fn(), setNightVision: vi.fn() },
      shadows: { restore: vi.fn() },
    } as unknown as RenderedEngine;
    benchDraw(engine, { post, nightVision: false, skyAngle: 23 });
    expect(heightFogUniforms.uHeightFog.value.y).toBe(1 / fog.scaleMetres);
    expect(heightFogUniforms.uHeightFog.value.z).toBe(fog.baseMetres);
  });

  it('captures scene counters in the mood scene-pass callback before post passes replace them', () => {
    const info = { render: { calls: 0, triangles: 0 } };
    let captured: { calls: number; triangles: number } | undefined;
    const engine = {
      renderer: { info, toneMapping: 0, toneMappingExposure: 1 },
      registry: startupContent().registry,
      scene: {},
      camera: new PerspectiveCamera(),
      meshes: { setLinearColors: vi.fn(), setPatterns: vi.fn(), setOcclusion: vi.fn() },
      mood: {
        restore: vi.fn(),
        setSky: vi.fn(),
        setNightVision: vi.fn(),
        render(afterScene: () => void) {
          info.render = { calls: 87, triangles: 54_321 };
          afterScene();
          info.render = { calls: 1, triangles: 0 }; // final fullscreen pass, the old incorrect sample
        },
      },
      shadows: { restore: vi.fn(), update: vi.fn() },
    } as unknown as RenderedEngine;

    benchDraw(engine, {
      post: true,
      nightVision: false,
      skyAngle: 23,
      reportSceneRender: (stats) => {
        captured = stats;
      },
    })();

    expect(captured).toEqual({ calls: 87, triangles: 54_321 });
    expect(info.render).toEqual({ calls: 1, triangles: 0 });
  });
});
