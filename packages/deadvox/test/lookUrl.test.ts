import {
  BLOOM_CLIP_BY_TONE,
  MAX_EXPOSURE,
  MIN_BLOOM_CLIP,
  MIN_EXPOSURE,
  SHADOW_DISTANCES,
} from '@skelly/engine/internal/core/mood.ts';
import {
  bloomClipFor,
  clampBloomClip,
  clampExposure,
  clampShadowDistance,
  clampTorch,
  DEFAULT_SHADOWS,
  DEFAULT_TORCH,
  type LookDefaults,
  lookOf,
  moodOf,
  TORCH_STEP,
} from '@skelly/engine/look';
import { setAutoToneWeight } from '@skelly/presentation/internal/render/autoTone.ts';
import { hotCheckUniform } from '@skelly/presentation/internal/render/hotCheck.ts';
import { ACESFilmicToneMapping, CustomToneMapping, NoToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { LookControls } from '../src/debug/look.ts';
import {
  defaultLookUrlState,
  LOOK_KEYS,
  type LookUrlState,
  parseLookParams,
  writeLookParams,
} from '../src/debug/lookUrl.ts';
import type { HashState } from '../src/hashState.ts';
import { BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { FakeMood } from './fakeMood.ts';
import { FakeShadows } from './fakeShadows.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

// Every switch off, against the parser's "on unless false" reading, and the exposure inside the clamp range, so a
// parser that ignores the given default for a switch or an exposure fails instead of passing by coincidence.
const URL_LOOK: LookDefaults = {
  ...LOOK_FIXTURE,
  exposure: 1.5,
  srgb: false,
  patterns: false,
  vao: false,
  post: false,
  bloom: false,
  film: false,
};
const DEFAULT_WEATHER = BASE_DAY_CYCLE.weather.defaults;
const URL_DEFAULTS = { look: URL_LOOK, defaultWeather: DEFAULT_WEATHER };
const weatherFixture = () => ({ fogginess: 0.2, cloudiness: 0, rain: 0 });
const DEFAULT_LOOK_URL_STATE = defaultLookUrlState(URL_DEFAULTS);
const parse = (hash: HashState) => parseLookParams(hash, URL_DEFAULTS);
const write = (hash: HashState, state: LookUrlState) => writeLookParams(hash, state, URL_DEFAULTS);
const isTenth = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
const isHundredth = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

// Every control away from its default.
const CHANGED_STATE: LookUrlState = {
  tone: 'none',
  exposure: 1.4,
  srgb: true,
  patterns: true,
  vao: true,
  freeze: true,
  post: true,
  bloom: true,
  film: true,
  grade: 0.6,
  bloomClip: 3.5,
  weather: { fogginess: 0.7, cloudiness: 0.4, rain: 0.9 },
  torch: 1.56,
  shadows: { sun: false, torch: false, distance: 64 },
  crackCheck: true,
  hotCheck: true,
};

describe('look hash keys', () => {
  it('reads defaults from an empty hash', () => {
    expect(parse({})).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(parse({ debug: true, seed: 7 })).toEqual(DEFAULT_LOOK_URL_STATE);
  });

  it('removes every registered look override when writing game defaults', () => {
    const changed = write({ debug: true, seed: 7 }, CHANGED_STATE);
    expect(LOOK_KEYS.length).toBeGreaterThan(0);
    expect(LOOK_KEYS.some((key) => key in changed)).toBe(true);
    const cleared = write(changed, DEFAULT_LOOK_URL_STATE);
    expect(cleared).toStrictEqual({ debug: true, seed: 7 });
    expect(LOOK_KEYS.filter((key) => key in cleared)).toEqual([]);
  });

  it('has the given default look as its defaults', () => {
    expect(DEFAULT_LOOK_URL_STATE).toEqual({
      ...lookOf(URL_LOOK),
      ...moodOf(URL_LOOK),
      freeze: false,
      weather: DEFAULT_WEATHER,
      torch: DEFAULT_TORCH,
      shadows: DEFAULT_SHADOWS,
      crackCheck: false,
      hotCheck: false,
    });
  });

  it('reads the diagnostic checks only from true, and writes them only when on', () => {
    expect(parse({ crackcheck: true, hotcheck: true })).toMatchObject({ crackCheck: true, hotCheck: true });
    expect(parse({ crackcheck: false, hotcheck: false })).toMatchObject({ crackCheck: false, hotCheck: false });
    expect(write({ debug: true, crackcheck: true, hotcheck: true }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, crackCheck: true })).toEqual({
      debug: true,
      crackcheck: true,
    });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, hotCheck: true })).toEqual({
      debug: true,
      hotcheck: true,
    });
  });

  it('round-trips a state', () => {
    expect(parse(write({}, CHANGED_STATE))).toEqual(CHANGED_STATE);
  });

  it('keeps both shadows on unless sunshadow / torchshadow is false, and omits the defaults', () => {
    expect(parse({ sunshadow: false }).shadows).toEqual({ ...DEFAULT_SHADOWS, sun: false });
    expect(parse({ torchshadow: false }).shadows).toEqual({ ...DEFAULT_SHADOWS, torch: false });
    expect(
      write({ debug: true, sunshadow: false, torchshadow: false, shadowdist: 64 }, DEFAULT_LOOK_URL_STATE),
    ).toEqual({ debug: true });
    const state = (shadows: LookUrlState['shadows']): LookUrlState => ({ ...DEFAULT_LOOK_URL_STATE, shadows });
    expect(write({ debug: true }, state({ sun: false, torch: true, distance: DEFAULT_SHADOWS.distance }))).toEqual({
      debug: true,
      sunshadow: false,
    });
    expect(write({ debug: true }, state({ sun: true, torch: false, distance: DEFAULT_SHADOWS.distance }))).toEqual({
      debug: true,
      torchshadow: false,
    });
  });

  it('clamps the shadow distance to a whole-metre range that holds every key stop', () => {
    const distance = (raw: number) => parse({ shadowdist: raw }).shadows.distance;
    for (const stop of SHADOW_DISTANCES) {
      expect(distance(stop)).toBe(stop);
    }
    for (const raw of [33.6, 1, -50, 500, 5000]) {
      expect(distance(raw)).toBe(clampShadowDistance(raw));
      expect(Number.isInteger(distance(raw))).toBe(true);
    }
    expect(distance(1)).toBeGreaterThan(1);
    expect(distance(-50)).toBe(distance(1));
    expect(distance(500)).toBeLessThan(500);
    expect(distance(5000)).toBe(distance(500));
    expect(parse({}).shadows.distance).toBe(DEFAULT_SHADOWS.distance);
    const nonDefaultDistance = SHADOW_DISTANCES.find((stop) => stop !== DEFAULT_SHADOWS.distance)!;
    expect(
      write(
        {},
        {
          ...DEFAULT_LOOK_URL_STATE,
          shadows: { ...DEFAULT_SHADOWS, distance: nonDefaultDistance },
        },
      ),
    ).toEqual({ shadowdist: nonDefaultDistance });
  });

  it('records only deviations from the defaults', () => {
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, srgb: true })).toEqual({ srgb: true });
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, tone: 'none' })).toEqual({ tone: 'none' });
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, exposure: 1 })).toEqual({ exposure: 1 });
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, weather: { ...DEFAULT_WEATHER, fogginess: 0 } })).toEqual({ fog: 0 });
    // Other values for the defaulted keys are dropped when the state is the default.
    expect(write({ debug: true, tone: 'auto', exposure: 3, fog: 0.2, grade: 1 }, DEFAULT_LOOK_URL_STATE)).toEqual({
      debug: true,
    });
  });

  it('reads every tone key, with auto the default and aces now written out', () => {
    for (const tone of ['none', 'agx', 'aces', 'neutral', 'auto']) {
      expect(parse({ tone }).tone).toBe(tone);
    }
    expect(parse({}).tone).toBe('auto');
    expect(parse({ tone: 'sepia' }).tone).toBe('auto');
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, tone: 'aces' })).toEqual({ tone: 'aces' });
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, tone: 'neutral' })).toEqual({ tone: 'neutral' });
    expect(write({ debug: true, tone: 'aces' }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
  });

  it('reads each mood switch as given, falls back to the given default, and omits the defaults', () => {
    expect(parse({})).toMatchObject({ post: false, bloom: false, film: false, grade: URL_LOOK.grade });
    expect(parse({ post: true, bloom: true, film: true })).toMatchObject({ post: true, bloom: true, film: true });
    expect(parse({ post: false, bloom: false, film: false })).toMatchObject({ post: false, bloom: false, film: false });
    expect(write({ debug: true, post: true, bloom: true, film: true, grade: 0.4 }, DEFAULT_LOOK_URL_STATE)).toEqual({
      debug: true,
    });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, bloom: true })).toEqual({ debug: true, bloom: true });
  });

  it('follows the tone mapper unless bloomclip overrides it, clamping in tenths', () => {
    const clip = (raw: number) => parse({ bloomclip: raw }).bloomClip;
    expect(parse({}).bloomClip).toBeNull();
    expect(clip(3.5)).toBe(clampBloomClip(3.5));
    const rounded = clip(3.26)!;
    expect(rounded).toBe(clampBloomClip(3.26));
    expect(isTenth(rounded)).toBe(true);
    expect(Math.abs(rounded - 3.26)).toBeLessThanOrEqual(0.05);
    expect(clip(0.2)).toBe(MIN_BLOOM_CLIP);
    expect(clip(-4)).toBe(MIN_BLOOM_CLIP);
    expect(clip(50)).toBeLessThan(50);
    expect(clip(500)).toBe(clip(50));
  });

  it('reads the tone mapper own clip as no override, and writes an override only when it differs', () => {
    const aces = BLOOM_CLIP_BY_TONE.aces!;
    const agx = BLOOM_CLIP_BY_TONE.agx!;
    expect(aces).not.toBe(agx);
    expect(parse({ tone: 'aces', bloomclip: aces }).bloomClip).toBeNull();
    expect(parse({ tone: 'agx', bloomclip: agx }).bloomClip).toBeNull();
    expect(parse({ tone: 'agx', bloomclip: aces }).bloomClip).toBe(aces);
    expect(write({ debug: true, bloomclip: 3 }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, bloomClip: 3 })).toEqual({ debug: true, bloomclip: 3 });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, tone: 'aces', bloomClip: aces })).toEqual({
      debug: true,
      tone: 'aces',
    });
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, tone: 'agx', bloomClip: aces })).toEqual({
      tone: 'agx',
      bloomclip: Number(aces.toFixed(1)),
    });
  });

  it('keeps any bloomclip under auto, whose own clip moves with the time of day', () => {
    // Both ends of auto's range are real overrides at some hour.
    const neutral = BLOOM_CLIP_BY_TONE.neutral!;
    const aces = BLOOM_CLIP_BY_TONE.aces!;
    expect(parse({ bloomclip: neutral }).bloomClip).toBe(neutral);
    expect(parse({ bloomclip: aces }).bloomClip).toBe(aces);
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, bloomClip: aces })).toEqual({
      debug: true,
      bloomclip: Number(aces.toFixed(1)),
    });
  });

  it('reads the flashlight multiplier clamped in hundredths, and writes it only when not the default', () => {
    const torch = (raw: number) => parse({ torch: raw }).torch;
    expect(parse({}).torch).toBe(DEFAULT_TORCH);
    expect(torch(2.5)).toBe(clampTorch(2.5));
    const rounded = torch(1.567);
    expect(rounded).toBe(clampTorch(1.567));
    expect(isHundredth(rounded)).toBe(true);
    expect(Math.abs(rounded - 1.567)).toBeLessThanOrEqual(0.005);
    expect(torch(0)).toBeGreaterThan(0);
    expect(torch(-5)).toBe(torch(0));
    expect(torch(99)).toBeLessThan(99);
    expect(torch(9999)).toBe(torch(99));
    expect(write({ debug: true, torch: 3 }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, torch: 0.64 })).toEqual({ debug: true, torch: 0.64 });
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, torch: 4 })).toEqual({ torch: 4 });
  });

  it('clamps each weather level to 0..1 in tenths', () => {
    const levels = (value: number) => parse({ fog: value, clouds: value, rain: value }).weather;
    expect(levels(0)).toEqual({ fogginess: 0, cloudiness: 0, rain: 0 });
    expect(levels(0.34)).toEqual({ fogginess: 0.3, cloudiness: 0.3, rain: 0.3 });
    expect(levels(7)).toEqual({ fogginess: 1, cloudiness: 1, rain: 1 });
    expect(levels(-1)).toEqual({ fogginess: 0, cloudiness: 0, rain: 0 });
  });

  it('reads colour decode from srgb, else the given default', () => {
    expect(parse({ srgb: false }).srgb).toBe(false);
    expect(parse({ srgb: true }).srgb).toBe(true);
    expect(parse({}).srgb).toBe(URL_LOOK.srgb);
  });

  it('clamps the grade to 0..1 in tenths', () => {
    expect(parse({ grade: 0 }).grade).toBe(0);
    expect(parse({ grade: 0.34 }).grade).toBe(0.3);
    expect(parse({ grade: 7 }).grade).toBe(1);
    expect(parse({ grade: -2 }).grade).toBe(0);
    expect(write({}, { ...DEFAULT_LOOK_URL_STATE, grade: 0 })).toEqual({ grade: 0 });
  });

  it('reads surface patterns from patterns, else the given default', () => {
    expect(parse({ patterns: false }).patterns).toBe(false);
    expect(parse({ patterns: true }).patterns).toBe(true);
    expect(parse({}).patterns).toBe(URL_LOOK.patterns);
    expect(write({ debug: true, patterns: true }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, patterns: true })).toEqual({
      debug: true,
      patterns: true,
    });
  });

  it('reads wide ambient occlusion from vao, else the given default', () => {
    expect(parse({ vao: false }).vao).toBe(false);
    expect(parse({ vao: true }).vao).toBe(true);
    expect(parse({}).vao).toBe(URL_LOOK.vao);
    expect(write({ debug: true, vao: true }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, vao: true })).toEqual({ debug: true, vao: true });
  });

  it('keeps the game freeze only while it is on', () => {
    expect(parse({ freeze: true }).freeze).toBe(true);
    expect(parse({ freeze: false }).freeze).toBe(false);
    expect(write({ debug: true, freeze: true }, DEFAULT_LOOK_URL_STATE)).toEqual({ debug: true });
    expect(write({ debug: true }, { ...DEFAULT_LOOK_URL_STATE, freeze: true })).toEqual({ debug: true, freeze: true });
  });

  it('ignores an unknown tone and non-finite numbers, an infinite exposure among them, instead of throwing', () => {
    expect(
      parse({
        tone: 'sepia',
        exposure: Number.NaN,
        grade: Number.NaN,
        fog: Number.NaN,
        clouds: Number.NaN,
        rain: Number.NaN,
        bloomclip: Number.NaN,
        torch: Number.NaN,
        shadowdist: Number.NaN,
      }),
    ).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(URL_LOOK.exposure).not.toBe(MAX_EXPOSURE);
    expect(parse({ exposure: Number.POSITIVE_INFINITY }).exposure).toBe(URL_LOOK.exposure);
  });

  it('clamps exposure to the exposure limits and rounds to a tenth', () => {
    expect(parse({ exposure: MAX_EXPOSURE * 3 }).exposure).toBe(MAX_EXPOSURE);
    expect(parse({ exposure: 0 }).exposure).toBe(MIN_EXPOSURE);
    const rounded = parse({ exposure: 1.26 }).exposure;
    expect(rounded).toBe(clampExposure(1.26));
    expect(isTenth(rounded)).toBe(true);
    expect(Math.abs(rounded - 1.26)).toBeLessThanOrEqual(0.05);
  });

  it('replaces only its own keys and keeps the rest', () => {
    const state: LookUrlState = { ...DEFAULT_LOOK_URL_STATE, tone: 'agx' };
    expect(write({ debug: true, tone: 'none', seed: 5, exposure: 2, cam: [1, 2, 3, 90, 0] }, state)).toStrictEqual({
      debug: true,
      seed: 5,
      cam: [1, 2, 3, 90, 0],
      tone: 'agx',
    });
  });
});

describe('restoring look controls from URL state', () => {
  const renderer = { toneMapping: NoToneMapping, toneMappingExposure: 1 };
  const meshes = {
    linearColorsOn: false,
    setLinearColors(on: boolean) {
      meshes.linearColorsOn = on;
    },
    patternsOn: true,
    setPatterns(on: boolean) {
      meshes.patternsOn = on;
    },
    occlusionOn: true,
    setOcclusion(on: boolean) {
      meshes.occlusionOn = on;
    },
  };

  it('takes the parsed tone, exposure, colour decode and patterns', () => {
    const look = new LookControls(renderer, meshes, new FakeMood(), {
      defaults: URL_LOOK,
      weather: weatherFixture(),
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse({ tone: 'neutral', exposure: 2.5, srgb: true, patterns: false, vao: false }));
    expect([look.toneKey, look.exposure, look.linearColors, look.patterns, look.occlusion]).toEqual([
      'neutral',
      2.5,
      true,
      false,
      false,
    ]);
  });

  it('takes the parsed mood pass and weather', () => {
    const mood = new FakeMood();
    const weather = weatherFixture();
    const look = new LookControls(renderer, meshes, mood, {
      defaults: URL_LOOK,
      weather,
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse({ post: false, bloom: false, film: false, grade: 0.5, fog: 0.6, clouds: 0.8, rain: 0.3 }));
    expect(look.moodState).toEqual({ post: false, bloom: false, film: false, grade: 0.5, bloomClip: null });
    expect(mood.grade).toBe(0.5);
    expect(weather).toEqual({ fogginess: 0.6, cloudiness: 0.8, rain: 0.3 });
  });

  it('takes the parsed bloom clip and flashlight strength, and steps them in direction up to their clamps', () => {
    const mood = new FakeMood();
    const flashlight = { strength: 1 };
    const game = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, mood, {
      defaults: URL_LOOK,
      weather: weatherFixture(),
      shadows: new FakeShadows(),
      flashlight,
    });
    look.restore(parse({ tone: 'aces', bloomclip: 3, torch: 2 }));
    expect([mood.bloomClip, look.bloomClip, look.bloomClipIsDefault, flashlight.strength, look.torch]).toEqual([
      3,
      3,
      false,
      2,
      2,
    ]);
    look.restore(parse({ tone: 'aces' }));
    expect([mood.bloomClip, look.bloomClip, look.bloomClipIsDefault, flashlight.strength]).toEqual([
      null,
      BLOOM_CLIP_BY_TONE.aces,
      true,
      DEFAULT_TORCH,
    ]);
    // Stepping from the derived value overrides it; stepping back onto it follows the tone mapper again.
    look.stepBloomClip(1);
    expect(mood.bloomClip).toBeGreaterThan(BLOOM_CLIP_BY_TONE.aces!);
    expect(look.moodState.bloomClip).toBe(mood.bloomClip);
    look.stepBloomClip(-1);
    expect(mood.bloomClip).toBeNull();
    look.stepBloomClip(-100);
    expect(mood.bloomClip).toBe(MIN_BLOOM_CLIP);
    const ceiling = clampBloomClip(Number.MAX_VALUE);
    look.stepBloomClip(100);
    expect(mood.bloomClip).toBe(ceiling);
    look.stepBloomClip(1);
    expect(mood.bloomClip).toBe(ceiling);
    look.stepTorch(1);
    expect(flashlight.strength).toBe(clampTorch(DEFAULT_TORCH * TORCH_STEP));
    expect(flashlight.strength).toBeGreaterThan(DEFAULT_TORCH);
    look.stepTorch(-1);
    expect(flashlight.strength).toBe(DEFAULT_TORCH);
    look.stepTorch(-100);
    expect(flashlight.strength).toBe(clampTorch(0));
    expect(flashlight.strength).toBeGreaterThan(0);
    look.stepTorch(100);
    expect(flashlight.strength).toBe(clampTorch(Number.MAX_VALUE));
  });

  it('takes the parsed diagnostic checks and toggles them', () => {
    const mood = new FakeMood();
    const look = new LookControls(renderer, meshes, mood, {
      defaults: URL_LOOK,
      weather: weatherFixture(),
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse({ crackcheck: true, hotcheck: true }));
    expect([look.crackCheck, mood.crackCheck, look.hotCheck, hotCheckUniform.value]).toEqual([true, true, true, 1]);
    look.toggleCrackCheck();
    look.toggleHotCheck();
    expect([look.crackCheck, look.hotCheck, hotCheckUniform.value]).toEqual([false, false, 0]);
    look.restore(parse({}));
    expect([look.crackCheck, look.hotCheck]).toEqual([false, false]);
  });

  it('takes the parsed shadow settings', () => {
    const shadows = new FakeShadows();
    const look = new LookControls(renderer, meshes, new FakeMood(), {
      defaults: URL_LOOK,
      weather: weatherFixture(),
      shadows,
      flashlight: { strength: 1 },
    });
    look.restore(parse({ sunshadow: false, shadowdist: 64 }));
    expect(look.shadowState).toEqual({ sun: false, torch: true, distance: 64 });
    expect(shadows.settings).toEqual({ sun: false, torch: true, distance: 64 });
  });

  it('follows the renderer it finds, so the game default look survives attaching the controls', () => {
    const game = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, new FakeMood(), {
      defaults: URL_LOOK,
      weather: weatherFixture(),
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    expect([look.toneKey, look.toneMappingName, game.toneMapping, game.toneMappingExposure]).toEqual([
      'aces',
      'ACES Filmic',
      ACESFilmicToneMapping,
      3,
    ]);
    look.restore(DEFAULT_LOOK_URL_STATE);
    expect([game.toneMapping, game.toneMappingExposure]).toEqual([CustomToneMapping, URL_LOOK.exposure]);
  });

  it('shows auto with the sky weight in its label, and follows the weight for the bloom clip', () => {
    const mood = new FakeMood();
    const game = { toneMapping: CustomToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, mood, {
      defaults: URL_LOOK,
      weather: weatherFixture(),
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    setAutoToneWeight(0.85);
    expect(look.toneKey).toBe('auto');
    expect(look.toneMappingName).toContain('0.85');
    expect(look.bloomClip).toBeCloseTo(bloomClipFor('auto', 0.85), 12);
    expect(look.bloomClipIsDefault).toBe(true);
    setAutoToneWeight(0);
    expect(look.bloomClip).toBeCloseTo(bloomClipFor('auto', 0), 12);
    // Stepping overrides; stepping back onto the live value (to a tenth) follows it again.
    look.stepBloomClip(1);
    expect(mood.bloomClip).toBeGreaterThan(bloomClipFor('auto', 0));
    look.stepBloomClip(-1);
    expect(mood.bloomClip).toBeNull();
    setAutoToneWeight(0);
  });

  it('steps fogginess within 0..1 and back to where it started', () => {
    const weather = weatherFixture();
    const look = new LookControls(renderer, meshes, new FakeMood(), {
      defaults: URL_LOOK,
      weather,
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.stepFogginess(1);
    expect(weather.fogginess).toBeGreaterThan(0.2);
    look.stepFogginess(-1);
    expect(weather.fogginess).toBe(0.2);
    look.stepFogginess(-20);
    expect(weather.fogginess).toBe(0);
    look.stepFogginess(20);
    expect(weather.fogginess).toBe(1);
  });
});
