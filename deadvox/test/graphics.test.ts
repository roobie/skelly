import { describe, expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues, validateContent } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
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
import { readGraphicsSettings, writeGraphicsSettings } from '../src/game/graphicsSettings.ts';

const scale = (label: string) => ({ label, min: 0.2, max: 0.9, default: 0.6 });
const toggle = (label: string) => ({ label, default: true, options: [false, true] });
const tuning: GraphicsOptions = {
  renderScale: scale('Fixture scene'),
  bloomScale: scale('Fixture bloom'),
  smallSunMap: toggle('Fixture shadow'),
  fastCamo: toggle('Fixture camo'),
  coarseWeathering: toggle('Fixture weather'),
};
const source = (options: GraphicsOptions) => ({
  source: 'fixture-graphics.json',
  data: { graphics: [{ id: CORE_CONTENT_IDS.coreGraphics, ...options }] },
});

it('validates graphics ranges, defaults and allowed toggle choices before admitting a file', () => {
  expect(validateContent(source(tuning))).toEqual([]);
  const invalid: GraphicsOptions[] = [
    { ...tuning, renderScale: { ...tuning.renderScale, min: 0.8, max: 0.3 } },
    { ...tuning, bloomScale: { ...tuning.bloomScale, default: 1 } },
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
