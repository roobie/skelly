import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, requiredContentIssues, validateContent } from '../src/core/content.ts';
import {
  GRAPHICS_KEYS,
  GRAPHICS_KNOBS,
  type GraphicsOptions,
  readGraphicsParams,
  resolveGraphics,
  setGraphicsSetting,
  validGraphicsSettings,
  writeGraphicsParams,
} from '../src/core/graphics.ts';
import { drugVignetteShown } from '../src/core/mood.ts';
import { GraphicsControls } from '../src/game/graphicsControls.ts';
import { readGraphicsSettings, writeGraphicsSettings } from '../src/game/graphicsSettings.ts';
import { Gore } from '../src/render/gore.ts';
import { Mood } from '../src/render/mood.ts';
import { fixtureIds as CORE_CONTENT_IDS } from './fixtures/capabilityIds.ts';
import { WORLD_GRAVITY } from './playerFixture.ts';

const scale = (label: string) => ({ label, min: 0.2, max: 0.9, default: 0.6 });
const toggle = (label: string) => ({ label, default: true, options: [false, true] });
const fixtureGraphics = {
  nearPlaneMetres: 0.01,
  playerViewFovDegrees: 75,
  opticLens: { rimSoftness: 0.04, reticleAntiAliasWidth: 0.5 },
};
const tuning: GraphicsOptions = {
  renderScale: {
    ...scale('Fixture scene'),
    adaptive: { enabled: true, targetRealMs: 10, min: 0.2, max: 0.9, step: 0.1, hysteresisRealMs: 1, sampleWindow: 4 },
  },
  bloomScale: scale('Fixture bloom'),
  drugVignette: { label: 'Fixture drug vignette', min: 0, max: 1, default: 1 },
  smallSunMap: toggle('Fixture shadow'),
  fastCamo: toggle('Fixture camo'),
  coarseWeathering: toggle('Fixture weather'),
  cachedSurfaceNoise: toggle('Fixture noise'),
};
const source = (options: GraphicsOptions) => ({
  source: 'fixture-graphics.json',
  data: {
    graphics: [
      {
        id: CORE_CONTENT_IDS.coreGraphics,
        capability: 'graphics',
        ...fixtureGraphics,
        readyRadiusM: 16,
        streamHysteresisM: 16,
        fogFarPlaneScale: 1.5,
        itemPictureCacheCapacity: 2,
        itemPicture: { framing: 1.1 },
        modelLoadConcurrency: 2,
        unbuiltSkyCap: 0.5,
        skyJobsInFlight: 2,
        skyPreloadRings: 1,
        itemViewer: {
          framing: 1,
          startYawDegrees: 0,
          startPitchDegrees: 0,
          pitchLimitDegrees: 80,
          degreesPerPixel: 1,
          zoomPerWheelPixel: 0.01,
          zoomMin: 0.5,
          zoomMax: 2,
        },
        mobActors: { maxCorpses: 9 },
        gore: { dropletCap: 11, splatCap: 13, dropletSpawnsPerFrame: 5, dripSourceCap: 2 },
        ...options,
      },
    ],
  },
});

it.each(['dropletCap', 'splatCap', 'dropletSpawnsPerFrame'] as const)(
  'renders validated zero %s without allocating that effect',
  (capacity) => {
    const candidate = source(tuning);
    candidate.data.graphics[0]!.gore[capacity] = 0;
    expect(validateContent(candidate)).toEqual([]);
    const row = buildRegistry([candidate]).registry.graphics.get(CORE_CONTENT_IDS.coreGraphics)!;
    const gore = new Gore(1, WORLD_GRAVITY, row.gore);
    try {
      gore.spray({ point: [0.5, 0.05, 0.5], direction: [0, -1, 0], impulse: 4 }, 100);
      if (capacity === 'splatCap') {
        expect(gore.activeDroplets).toBeGreaterThan(0);
      } else {
        expect(gore.activeDroplets).toBe(0);
      }
      gore.update(1, () => true);
      gore.landed([0.5, 0, 0.5]);
      if (capacity === 'splatCap') {
        expect(gore.activeSplats).toBe(0);
      } else {
        expect(gore.activeSplats).toBeGreaterThan(0);
      }
    } finally {
      gore.dispose();
    }
  },
);

it('validates graphics ranges, defaults and allowed toggle choices before admitting a file', () => {
  expect(validateContent(source(tuning))).toEqual([]);
  const invalid: GraphicsOptions[] = [
    { ...tuning, renderScale: { ...tuning.renderScale, min: 0.8, max: 0.3 } },
    { ...tuning, bloomScale: { ...tuning.bloomScale, default: 1 } },
    { ...tuning, bloomScale: { ...tuning.bloomScale, min: 0 } },
    {
      ...tuning,
      renderScale: {
        ...tuning.renderScale,
        adaptive: { ...tuning.renderScale.adaptive, min: tuning.renderScale.min / 2 },
      },
    },
    {
      ...tuning,
      renderScale: { ...tuning.renderScale, adaptive: { ...tuning.renderScale.adaptive, sampleWindow: 0 } },
    },
    {
      ...tuning,
      renderScale: {
        ...tuning.renderScale,
        adaptive: { ...tuning.renderScale.adaptive, hysteresisRealMs: tuning.renderScale.adaptive.targetRealMs },
      },
    },
    { ...tuning, smallSunMap: { ...tuning.smallSunMap, options: [] } },
    { ...tuning, fastCamo: { ...tuning.fastCamo, options: [false] } },
    { ...tuning, coarseWeathering: { ...tuning.coarseWeathering, options: [true, true] } },
  ];
  for (const candidate of invalid) {
    expect(validateContent(source(candidate)).length).toBeGreaterThan(0);
    expect(buildRegistry([source(candidate)]).registry.graphics.size).toBe(0);
  }
});

it('merges a graphics mod by row identity and requires graphics in a playable pack', () => {
  const override = { ...tuning, renderScale: { ...tuning.renderScale, default: 0.4 } };
  const { registry } = buildRegistry([source(tuning), { ...source(override), source: 'mod.json' }]);
  expect(registry.graphics.get(CORE_CONTENT_IDS.coreGraphics)?.renderScale.default).toBe(0.4);
  expect(requiredContentIssues(registry).some(({ path }) => path === 'graphics')).toBe(false);
  expect(requiredContentIssues(buildRegistry([]).registry).some(({ path }) => path === 'graphics')).toBe(true);
});

it('resolves URL over player over mod for every knob, including explicit false and defaults', () => {
  for (const key of GRAPHICS_KEYS) {
    const option = tuning[key];
    const playerValue = 'options' in option ? false : option.min;
    const urlValue = option.default;
    expect(resolveGraphics(tuning)[key]).toBe(option.default);
    expect(resolveGraphics(tuning, { [key]: playerValue })[key]).toBe(playerValue);
    expect(resolveGraphics(tuning, { [key]: playerValue }, { [key]: urlValue })[key]).toBe(urlValue);
    expect(resolveGraphics(tuning, { [key]: urlValue }, { [key]: playerValue })[key]).toBe(playerValue);
  }
});

it('derives URL bounds and explicit override round-trip from each content option', () => {
  let overrides = {};
  for (const key of GRAPHICS_KEYS) {
    const option = tuning[key];
    overrides = { ...overrides, [key]: 'options' in option ? false : option.default };
    if ('min' in option) {
      const params = new URLSearchParams({ [GRAPHICS_KNOBS[key].url]: String(option.min / 2) });
      expect(readGraphicsParams(params, tuning)[key]).toBe(option.min);
    }
  }
  const params = writeGraphicsParams(new URLSearchParams('seed=fixture'), tuning, overrides);
  expect(params.get('seed')).toBe('fixture');
  expect(readGraphicsParams(params, tuning)).toEqual(overrides);
  expect(readGraphicsParams(new URLSearchParams('renderscale=NaN&bloomscale=&sunsmall=invalid'), tuning)).toEqual({});
});

it('validated setters reject disallowed values without mutating the player choices', () => {
  const settings = setGraphicsSetting(tuning, {}, 'renderScale', tuning.renderScale.min);
  const changed = setGraphicsSetting(tuning, settings, 'fastCamo', false);
  expect(settings.fastCamo).toBeUndefined();
  expect(changed.fastCamo).toBe(false);
  expect(() => setGraphicsSetting(tuning, settings, 'renderScale', tuning.renderScale.max + 1)).toThrow(RangeError);
  const locked = { ...tuning, fastCamo: { ...tuning.fastCamo, options: [true] } };
  expect(() => setGraphicsSetting(locked, settings, 'fastCamo', false)).toThrow(RangeError);
});

it('applies all resolved knobs on startup and player changes, with URL priority gated by debug', () => {
  const targets = {
    mood: { setRenderScale: vi.fn(), setBloomScale: vi.fn(), setDrugVignetteScale: vi.fn() },
    shadows: { setSmallSunMap: vi.fn() },
    meshes: { setFastCamo: vi.fn(), setCoarseWeathering: vi.fn(), setCachedSurfaceNoise: vi.fn() },
  };
  let saved = '';
  const storage = {
    getItem: () => saved || null,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  writeGraphicsSettings(tuning, { renderScale: tuning.renderScale.min, fastCamo: false }, storage);
  const params = writeGraphicsParams(new URLSearchParams(), tuning, { fastCamo: true });
  const controls = new GraphicsControls(tuning, targets, { debug: false, params, storage });
  expect(targets.mood.setRenderScale).toHaveBeenLastCalledWith(tuning.renderScale.min, true);
  expect(targets.mood.setBloomScale).toHaveBeenLastCalledWith(tuning.bloomScale.default);
  expect(targets.mood.setDrugVignetteScale).toHaveBeenLastCalledWith(tuning.drugVignette.default);
  expect(targets.shadows.setSmallSunMap).toHaveBeenLastCalledWith(tuning.smallSunMap.default);
  expect(targets.meshes.setFastCamo).toHaveBeenLastCalledWith(false);
  expect(targets.meshes.setCoarseWeathering).toHaveBeenLastCalledWith(tuning.coarseWeathering.default);
  expect(targets.meshes.setCachedSurfaceNoise).toHaveBeenLastCalledWith(tuning.cachedSurfaceNoise.default);
  controls.set('cachedSurfaceNoise', false);
  expect(targets.meshes.setCachedSurfaceNoise).toHaveBeenLastCalledWith(false);
  controls.clear('cachedSurfaceNoise');
  controls.clear('renderScale');
  expect(targets.mood.setRenderScale).toHaveBeenLastCalledWith(tuning.renderScale.default, false);
  expect(readGraphicsSettings(tuning, storage)).toEqual({ fastCamo: false });
  const debug = new GraphicsControls(tuning, targets, { debug: true, params, storage });
  debug.set('fastCamo', false);
  expect(targets.meshes.setFastCamo).toHaveBeenLastCalledWith(true);
  expect(readGraphicsSettings(tuning, storage)).toEqual({ fastCamo: false });
  expect(() => debug.set('bloomScale', tuning.bloomScale.max + 1)).toThrow(RangeError);
  expect(readGraphicsSettings(tuning, storage)).toEqual({ fastCamo: false });
});

it('mood scale setters enforce content bounds without the former URL trial floors', () => {
  const mood = new Mood(
    { domElement: new EventTarget() } as unknown as WebGLRenderer,
    new Scene(),
    new PerspectiveCamera(),
    { ...fixtureGraphics, ...tuning },
  );
  mood.setRenderScale(tuning.renderScale.min);
  mood.setBloomScale(tuning.bloomScale.min);
  expect(mood.renderScale).toBe(tuning.renderScale.min);
  expect(mood.bloomScale).toBe(tuning.bloomScale.min);
  expect(() => mood.setRenderScale(tuning.renderScale.min / 2)).toThrow(RangeError);
  expect(() => mood.setBloomScale(tuning.bloomScale.max + 1)).toThrow(RangeError);
  expect(mood.renderScale).toBe(tuning.renderScale.min);
  expect(mood.bloomScale).toBe(tuning.bloomScale.min);
});

it('a drug vignette setting of off shows no vignette however strong the dose', () => {
  const off = resolveGraphics(tuning, setGraphicsSetting(tuning, {}, 'drugVignette', 0)).drugVignette;
  const full = resolveGraphics(tuning).drugVignette;
  expect(drugVignetteShown(1, off)).toBe(0);
  expect(drugVignetteShown(1, full)).toBeGreaterThan(0);
});

describe('machine graphics settings persistence', () => {
  const memoryStorage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
  };

  it('round-trips only explicit validated player choices, leaving absent choices content-owned', () => {
    const storage = memoryStorage();
    const settings = setGraphicsSetting(tuning, {}, 'fastCamo', false);
    writeGraphicsSettings(tuning, settings, storage);
    expect(readGraphicsSettings(tuning, storage)).toEqual(settings);
    const mod = { ...tuning, bloomScale: { ...tuning.bloomScale, default: tuning.bloomScale.min } };
    expect(resolveGraphics(mod, readGraphicsSettings(mod, storage)).bloomScale).toBe(mod.bloomScale.default);
    const locked = { ...tuning, fastCamo: { ...tuning.fastCamo, options: [true] } };
    expect(readGraphicsSettings(locked, storage)).toEqual({});
  });

  it('treats malformed data and unavailable storage as no player override', () => {
    expect(
      validGraphicsSettings(tuning, { renderScale: Number.POSITIVE_INFINITY, fastCamo: 'false', other: true }),
    ).toEqual({});
    expect(readGraphicsSettings(tuning, { getItem: () => '{', setItem: () => undefined })).toEqual({});
    const unavailable = {
      getItem: (): string => {
        throw new Error('unavailable');
      },
      setItem: (): void => {
        throw new Error('unavailable');
      },
    };
    expect(readGraphicsSettings(tuning, unavailable)).toEqual({});
    expect(() => writeGraphicsSettings(tuning, {}, unavailable)).not.toThrow();
  });
});
