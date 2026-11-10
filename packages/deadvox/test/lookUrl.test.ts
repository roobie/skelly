import { ACESFilmicToneMapping, CustomToneMapping, NoToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { BLOOM_CLIP_BY_TONE, MAX_EXPOSURE, MIN_BLOOM_CLIP, MIN_EXPOSURE, SHADOW_DISTANCES } from '../../engine/src/core/mood.ts';
import { LookControls } from '../src/debug/look.ts';
import {
  defaultLookUrlState,
  LOOK_PARAMS,
  type LookUrlState,
  lookUrl,
  parseLookParams,
  writeLookParams,
} from '../src/debug/lookUrl.ts';
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
} from '../../engine/src/look.ts';
import { setAutoToneWeight } from '../src/render/autoTone.ts';
import { hotCheckUniform } from '../src/render/hotCheck.ts';
import { BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { FakeMood } from './fakeMood.ts';
import { FakeShadows } from './fakeShadows.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

// Every switch off, against the parser's "on unless 0" reading, and the exposure inside the clamp range, so a parser
// that ignores the given default for a switch or an exposure fails instead of passing by coincidence.
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
const DEFAULT_FOGGINESS = BASE_DAY_CYCLE.weather.defaultFogginess;
const URL_DEFAULTS = { look: URL_LOOK, defaultFogginess: DEFAULT_FOGGINESS };
const DEFAULT_LOOK_URL_STATE = defaultLookUrlState(URL_DEFAULTS);
const parse = (query: string) => parseLookParams(new URLSearchParams(query), URL_DEFAULTS);
const write = (query: string, state: LookUrlState) =>
  writeLookParams(new URLSearchParams(query), state, URL_DEFAULTS).toString();
const isTenth = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
const isHundredth = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

describe('look URL parameters', () => {
  it('reads defaults from an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(parse('debug=1&site=testHouse&seed=7')).toEqual(DEFAULT_LOOK_URL_STATE);
  });

  it('removes every registered look override when writing game defaults', () => {
    const params = new URLSearchParams('debug=1&seed=7');
    expect(LOOK_PARAMS.length).toBeGreaterThan(0);
    for (const name of LOOK_PARAMS) {
      params.set(name, 'fixture');
    }
    expect(write(params.toString(), DEFAULT_LOOK_URL_STATE)).toBe('debug=1&seed=7');
  });

  it('has the given default look as its defaults', () => {
    expect(DEFAULT_LOOK_URL_STATE).toEqual({
      ...lookOf(URL_LOOK),
      ...moodOf(URL_LOOK),
      freeze: false,
      fogginess: DEFAULT_FOGGINESS,
      torch: DEFAULT_TORCH,
      shadows: DEFAULT_SHADOWS,
      crackCheck: false,
      hotCheck: false,
    });
  });

  it('reads the diagnostic checks only from "1", and writes them only when on', () => {
    expect(parse('crackcheck=1&hotcheck=1')).toMatchObject({ crackCheck: true, hotCheck: true });
    expect(parse('crackcheck=0&hotcheck=true')).toMatchObject({ crackCheck: false, hotCheck: false });
    expect(write('debug=1&crackcheck=1&hotcheck=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, crackCheck: true })).toBe('debug=1&crackcheck=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, hotCheck: true })).toBe('debug=1&hotcheck=1');
  });

  it('round-trips a state', () => {
    const state: LookUrlState = {
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
      fogginess: 0.7,
      torch: 1.56,
      shadows: { sun: false, torch: false, distance: 64 },
      crackCheck: true,
      hotCheck: true,
    };
    expect(parse(write('', state))).toEqual(state);
  });

  it('leaves graphics override identity untouched on unrelated look changes', () => {
    const query = 'debug=1&renderscale=1&bloomscale=0.2&sunsmall=0&camofast=1&weathercoarse=0';
    const changed = new URLSearchParams(write(query, { ...DEFAULT_LOOK_URL_STATE, tone: 'agx' }));
    const original = new URLSearchParams(query);
    for (const [key, value] of original) {
      expect(changed.get(key)).toBe(value);
    }
    expect(write('debug=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
  });

  it('keeps both shadows on unless sunshadow=0 / torchshadow=0, and omits the defaults', () => {
    expect(parse('sunshadow=0').shadows).toEqual({ ...DEFAULT_SHADOWS, sun: false });
    expect(parse('torchshadow=0').shadows).toEqual({ ...DEFAULT_SHADOWS, torch: false });
    expect(parse('sunshadow=1&torchshadow=off').shadows).toEqual(DEFAULT_LOOK_URL_STATE.shadows);
    expect(write('debug=1&sunshadow=0&torchshadow=0&shadowdist=64', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    const state = (shadows: LookUrlState['shadows']): LookUrlState => ({ ...DEFAULT_LOOK_URL_STATE, shadows });
    expect(write('debug=1', state({ sun: false, torch: true, distance: DEFAULT_SHADOWS.distance }))).toBe(
      'debug=1&sunshadow=0',
    );
    expect(write('debug=1', state({ sun: true, torch: false, distance: DEFAULT_SHADOWS.distance }))).toBe(
      'debug=1&torchshadow=0',
    );
  });

  it('clamps the shadow distance to a whole-metre range that holds every key stop, and ignores nonsense', () => {
    const distance = (raw: string) => parse(`shadowdist=${raw}`).shadows.distance;
    for (const stop of SHADOW_DISTANCES) {
      expect(distance(String(stop))).toBe(stop);
    }
    for (const raw of [33.6, 1, -50, 500, 5000]) {
      expect(distance(String(raw))).toBe(clampShadowDistance(raw));
      expect(Number.isInteger(distance(String(raw)))).toBe(true);
    }
    expect(distance('1')).toBeGreaterThan(1);
    expect(distance('-50')).toBe(distance('1'));
    expect(distance('500')).toBeLessThan(500);
    expect(distance('5000')).toBe(distance('500'));
    expect(distance('')).toBe(DEFAULT_SHADOWS.distance);
    expect(distance('abc')).toBe(DEFAULT_SHADOWS.distance);
    const nonDefaultDistance = SHADOW_DISTANCES.find((stop) => stop !== DEFAULT_SHADOWS.distance)!;
    expect(
      write('', {
        ...DEFAULT_LOOK_URL_STATE,
        shadows: { ...DEFAULT_SHADOWS, distance: nonDefaultDistance },
      }),
    ).toBe(`shadowdist=${nonDefaultDistance}`);
  });

  it('records only deviations from the defaults', () => {
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, srgb: true })).toBe('srgb=1');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'none' })).toBe('tone=none');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, exposure: 1 })).toBe('exposure=1.0');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, fogginess: 0 })).toBe('fog=0.0');
    // Spellings of other values for the defaulted parameters read as the default and are dropped.
    expect(write('debug=1&tone=auto&exposure=3&fog=0.2&grade=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
  });

  it('reads every tone key, with auto the default and aces now written out', () => {
    for (const tone of ['none', 'agx', 'aces', 'neutral', 'auto']) {
      expect(parse(`tone=${tone}`).tone).toBe(tone);
    }
    expect(parse('').tone).toBe('auto');
    expect(parse('tone=sepia').tone).toBe('auto');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'aces' })).toBe('tone=aces');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'neutral' })).toBe('tone=neutral');
    expect(write('debug=1&tone=aces', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
  });

  it('reads each mood switch from 1 or 0, falls back to the given default, and omits the defaults', () => {
    expect(parse('')).toMatchObject({ post: false, bloom: false, film: false, grade: URL_LOOK.grade });
    expect(parse('post=1&bloom=1&film=1')).toMatchObject({ post: true, bloom: true, film: true });
    expect(parse('post=0&bloom=0&film=0')).toMatchObject({ post: false, bloom: false, film: false });
    expect(parse('post=on&bloom=off&film=')).toMatchObject({ post: false, bloom: false, film: false });
    expect(write('debug=1&post=1&bloom=1&film=1&grade=0.4', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloom: true })).toBe('debug=1&bloom=1');
  });

  it('follows the tone mapper unless bloomclip overrides it, clamping in tenths', () => {
    const clip = (raw: string) => parse(`bloomclip=${raw}`).bloomClip;
    expect(parse('').bloomClip).toBeNull();
    expect(clip('3.5')).toBe(clampBloomClip(3.5));
    const rounded = clip('3.26')!;
    expect(rounded).toBe(clampBloomClip(3.26));
    expect(isTenth(rounded)).toBe(true);
    expect(Math.abs(rounded - 3.26)).toBeLessThanOrEqual(0.05);
    expect(clip('0.2')).toBe(MIN_BLOOM_CLIP);
    expect(clip('-4')).toBe(MIN_BLOOM_CLIP);
    expect(clip('50')).toBeLessThan(50);
    expect(clip('500')).toBe(clip('50'));
    expect(clip('')).toBeNull();
    expect(clip('abc')).toBeNull();
  });

  it('reads the tone mapper own clip as no override, and writes an override only when it differs', () => {
    const aces = BLOOM_CLIP_BY_TONE.aces!;
    const agx = BLOOM_CLIP_BY_TONE.agx!;
    expect(aces).not.toBe(agx);
    expect(parse(`tone=aces&bloomclip=${aces}`).bloomClip).toBeNull();
    expect(parse(`tone=agx&bloomclip=${agx}`).bloomClip).toBeNull();
    expect(parse(`tone=agx&bloomclip=${aces}`).bloomClip).toBe(aces);
    expect(write('debug=1&bloomclip=3', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloomClip: 3 })).toBe('debug=1&bloomclip=3.0');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, tone: 'aces', bloomClip: aces })).toBe('debug=1&tone=aces');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'agx', bloomClip: aces })).toBe(
      `tone=agx&bloomclip=${aces.toFixed(1)}`,
    );
  });

  it('keeps any bloomclip under auto, whose own clip moves with the time of day', () => {
    // Both ends of auto's range are real overrides at some hour.
    const neutral = BLOOM_CLIP_BY_TONE.neutral!;
    const aces = BLOOM_CLIP_BY_TONE.aces!;
    expect(parse(`bloomclip=${neutral}`).bloomClip).toBe(neutral);
    expect(parse(`bloomclip=${aces}`).bloomClip).toBe(aces);
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloomClip: aces })).toBe(
      `debug=1&bloomclip=${aces.toFixed(1)}`,
    );
  });

  it('reads the flashlight multiplier clamped in hundredths, and writes it only when not the default', () => {
    const torch = (raw: string) => parse(`torch=${raw}`).torch;
    expect(parse('').torch).toBe(DEFAULT_TORCH);
    expect(torch('2.5')).toBe(clampTorch(2.5));
    const rounded = torch('1.567');
    expect(rounded).toBe(clampTorch(1.567));
    expect(isHundredth(rounded)).toBe(true);
    expect(Math.abs(rounded - 1.567)).toBeLessThanOrEqual(0.005);
    expect(torch('0')).toBeGreaterThan(0);
    expect(torch('-5')).toBe(torch('0'));
    expect(torch('99')).toBeLessThan(99);
    expect(torch('9999')).toBe(torch('99'));
    expect(torch('')).toBe(DEFAULT_TORCH);
    expect(torch('abc')).toBe(DEFAULT_TORCH);
    expect(write('debug=1&torch=3', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, torch: 0.64 })).toBe('debug=1&torch=0.64');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, torch: 4 })).toBe('torch=4');
  });

  it('clamps fogginess to 0..1 in tenths and ignores nonsense', () => {
    expect(parse('fog=0').fogginess).toBe(0);
    expect(parse('fog=0.34').fogginess).toBe(0.3);
    expect(parse('fog=7').fogginess).toBe(1);
    expect(parse('fog=-1').fogginess).toBe(0);
    expect(parse('fog=').fogginess).toBe(DEFAULT_FOGGINESS);
    expect(parse('fog=abc').fogginess).toBe(DEFAULT_FOGGINESS);
  });

  it('reads colour decode from srgb=1 or 0, else the given default', () => {
    expect(parse('srgb=0').srgb).toBe(false);
    expect(parse('srgb=1').srgb).toBe(true);
    expect(parse('srgb=on').srgb).toBe(URL_LOOK.srgb);
  });

  it('clamps the grade to 0..1 in tenths and ignores nonsense', () => {
    expect(parse('grade=0').grade).toBe(0);
    expect(parse('grade=0.34').grade).toBe(0.3);
    expect(parse('grade=7').grade).toBe(1);
    expect(parse('grade=-2').grade).toBe(0);
    expect(parse('grade=').grade).toBe(URL_LOOK.grade);
    expect(parse('grade=abc').grade).toBe(URL_LOOK.grade);
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, grade: 0 })).toBe('grade=0.0');
  });

  it('reads surface patterns from patterns=1 or 0, else the given default', () => {
    expect(parse('patterns=0').patterns).toBe(false);
    expect(parse('patterns=1').patterns).toBe(true);
    expect(parse('patterns=on').patterns).toBe(URL_LOOK.patterns);
    expect(write('debug=1&patterns=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, patterns: true })).toBe('debug=1&patterns=1');
  });

  it('reads wide ambient occlusion from vao=1 or 0, else the given default', () => {
    expect(parse('vao=0').vao).toBe(false);
    expect(parse('vao=1').vao).toBe(true);
    expect(parse('vao=on').vao).toBe(URL_LOOK.vao);
    expect(write('debug=1&vao=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, vao: true })).toBe('debug=1&vao=1');
  });

  it('keeps the game freeze only while it is on', () => {
    expect(parse('freeze=1').freeze).toBe(true);
    expect(parse('freeze=true').freeze).toBe(false);
    expect(write('debug=1&freeze=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, freeze: true })).toBe('debug=1&freeze=1');
  });

  it('ignores invalid values, an infinite exposure among them, instead of throwing', () => {
    expect(
      parse(
        'tone=sepia&exposure=abc&srgb=yes&freeze=yes&renderscale=NaN&bloomscale=&sunsmall=yes&camofast=on&weathercoarse=off',
      ),
    ).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(parse('exposure=&tone=')).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(URL_LOOK.exposure).not.toBe(MAX_EXPOSURE);
    expect(parse('exposure=Infinity').exposure).toBe(URL_LOOK.exposure);
  });

  it('clamps exposure to the exposure limits and rounds to a tenth', () => {
    expect(parse(`exposure=${MAX_EXPOSURE * 3}`).exposure).toBe(MAX_EXPOSURE);
    expect(parse('exposure=0').exposure).toBe(MIN_EXPOSURE);
    const rounded = parse('exposure=1.26').exposure;
    expect(rounded).toBe(clampExposure(1.26));
    expect(isTenth(rounded)).toBe(true);
    expect(Math.abs(rounded - 1.26)).toBeLessThanOrEqual(0.05);
  });

  it('replaces only its own parameters and keeps the rest, path and hash', () => {
    const state: LookUrlState = { ...DEFAULT_LOOK_URL_STATE, tone: 'agx' };
    expect(write('debug=1&tone=none&seed=5&exposure=2&time=20%3A30&site=testHouse', state)).toBe(
      'debug=1&seed=5&time=20%3A30&site=testHouse&tone=agx',
    );
    expect(lookUrl('http://localhost:5173/play?debug=1&time=20:30&srgb=0#x', state, URL_DEFAULTS)).toBe(
      'http://localhost:5173/play?debug=1&time=20:30&tone=agx#x',
    );
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
      weather: { fogginess: 0.2 },
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse('tone=neutral&exposure=2.5&srgb=1&patterns=0&vao=0'));
    expect([look.toneKey, look.exposure, look.linearColors, look.patterns, look.occlusion]).toEqual([
      'neutral',
      2.5,
      true,
      false,
      false,
    ]);
  });

  it('takes the parsed mood pass and fogginess', () => {
    const mood = new FakeMood();
    const weather = { fogginess: 0.2 };
    const look = new LookControls(renderer, meshes, mood, {
      defaults: URL_LOOK,
      weather,
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse('post=0&bloom=0&film=0&grade=0.5&fog=0.6'));
    expect(look.moodState).toEqual({ post: false, bloom: false, film: false, grade: 0.5, bloomClip: null });
    expect(mood.grade).toBe(0.5);
    expect(weather.fogginess).toBe(0.6);
  });

  it('takes the parsed bloom clip and flashlight strength, and steps them in direction up to their clamps', () => {
    const mood = new FakeMood();
    const flashlight = { strength: 1 };
    const game = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, mood, {
      defaults: URL_LOOK,
      weather: { fogginess: 0.2 },
      shadows: new FakeShadows(),
      flashlight,
    });
    look.restore(parse('tone=aces&bloomclip=3&torch=2'));
    expect([mood.bloomClip, look.bloomClip, look.bloomClipIsDefault, flashlight.strength, look.torch]).toEqual([
      3,
      3,
      false,
      2,
      2,
    ]);
    look.restore(parse('tone=aces'));
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
      weather: { fogginess: 0.2 },
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse('crackcheck=1&hotcheck=1'));
    expect([look.crackCheck, mood.crackCheck, look.hotCheck, hotCheckUniform.value]).toEqual([true, true, true, 1]);
    look.toggleCrackCheck();
    look.toggleHotCheck();
    expect([look.crackCheck, look.hotCheck, hotCheckUniform.value]).toEqual([false, false, 0]);
    look.restore(parse(''));
    expect([look.crackCheck, look.hotCheck]).toEqual([false, false]);
  });

  it('takes the parsed shadow settings', () => {
    const shadows = new FakeShadows();
    const look = new LookControls(renderer, meshes, new FakeMood(), {
      defaults: URL_LOOK,
      weather: { fogginess: 0.2 },
      shadows,
      flashlight: { strength: 1 },
    });
    look.restore(parse('sunshadow=0&shadowdist=64'));
    expect(look.shadowState).toEqual({ sun: false, torch: true, distance: 64 });
    expect(shadows.settings).toEqual({ sun: false, torch: true, distance: 64 });
  });

  it('follows the renderer it finds, so the game default look survives attaching the controls', () => {
    const game = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, new FakeMood(), {
      defaults: URL_LOOK,
      weather: { fogginess: 0.2 },
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
      weather: { fogginess: 0.2 },
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
    const weather = { fogginess: 0.2 };
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
