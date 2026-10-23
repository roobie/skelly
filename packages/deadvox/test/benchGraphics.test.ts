import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import baseDayCycle from '../src/content/base/dayCycle.json' with { type: 'json' };
import { buildRegistry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { resolveGraphics } from '../src/core/graphics.ts';
import { configFromUrl } from '../src/game/config.ts';
import { createEngine } from '../src/game/engine.ts';
import { GraphicsControls } from '../src/game/graphicsControls.ts';
import { writeGraphicsSettings } from '../src/game/graphicsSettings.ts';
import { Mood } from '../src/render/mood.ts';

const owner = vi.hoisted(() => ({ setup: undefined as unknown }));
vi.mock('../src/game/worldSetup.ts', () => ({ createWorldSetup: () => owner.setup }));
afterEach(() => vi.unstubAllGlobals());

const scale = { label: 'Fixture scale', min: 0.2, max: 1, default: 0.7 };
const toggle = { label: 'Fixture toggle', options: [false, true], default: true };
const tuning = {
  renderScale: {
    ...scale,
    adaptive: {
      enabled: true,
      targetRealMs: 10,
      min: scale.min,
      max: scale.max,
      step: 0.1,
      hysteresisRealMs: 1,
      sampleWindow: 4,
    },
  },
  bloomScale: scale,
  drugVignette: scale,
  smallSunMap: toggle,
  fastCamo: toggle,
  coarseWeathering: toggle,
  cachedSurfaceNoise: toggle,
};

it('benchmark engines use mod defaults despite saved graphics preferences and debug URL overrides', () => {
  const content = buildRegistry([
    { source: 'base/dayCycle.json', data: baseDayCycle },
    {
      source: 'fixture',
      data: {
        graphics: [
          {
            id: CORE_CONTENT_IDS.coreGraphics,
            readyRadiusM: 16,
            itemPictureCacheCapacity: 2,
            mobActors: { maxCorpses: 9 },
            gore: { dropletCap: 11, splatCap: 13, dropletSpawnsPerFrame: 5, dripSourceCap: 2 },
            ...tuning,
          },
        ],
      },
    },
  ]);
  const { registry } = content;
  owner.setup = { registry, skyFields: { fields: [] } };
  let saved = '';
  const storage = {
    getItem: vi.fn(() => saved),
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  writeGraphicsSettings(tuning, { renderScale: scale.min, fastCamo: false }, storage);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { search: '?renderscale=0.2&camofast=0' });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
    },
  );
  const config = configFromUrl(new URLSearchParams('debug=1'), content);
  const view = { clientWidth: 1, clientHeight: 1 } as HTMLElement;
  const player = createEngine(config, view, undefined, { render: false });
  expect(player.graphics.values.fastCamo).toBe(false);
  storage.getItem.mockClear();
  const benchmark = createEngine(config, view, undefined, { render: false, graphicsSource: 'mod' });
  expect(benchmark.graphics.values).toEqual(resolveGraphics(tuning));
  expect(storage.getItem).not.toHaveBeenCalled();
});

it('post benchmark scale stays at the content default under GPU overload, including after graphics reapplication', () => {
  const mood = new Mood(
    { domElement: new EventTarget() } as unknown as WebGLRenderer,
    new Scene(),
    new PerspectiveCamera(),
    tuning,
  );
  mood.setPost(true);
  const controls = new GraphicsControls(
    tuning,
    {
      mood,
      meshes: { setFastCamo: vi.fn(), setCoarseWeathering: vi.fn(), setCachedSurfaceNoise: vi.fn() },
    },
    {
      source: 'mod',
      debug: true,
      params: new URLSearchParams(),
      storage: { getItem: () => null, setItem: vi.fn() },
    },
  );
  const overload = () => {
    for (let sample = 0; sample < tuning.renderScale.adaptive.sampleWindow; sample++) {
      mood.recordGpuTime(tuning.renderScale.adaptive.targetRealMs * 2, mood.renderScale);
    }
  };
  overload();
  expect(mood.renderScale).toBe(tuning.renderScale.default);
  controls.set('bloomScale', tuning.bloomScale.min);
  overload();
  expect(mood.renderScale).toBe(tuning.renderScale.default);
});
