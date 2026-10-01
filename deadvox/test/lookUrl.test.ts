import { ACESFilmicToneMapping, CustomToneMapping, NoToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { LookControls } from '../src/debug/look.ts';
import {
  DEFAULT_LOOK_URL_STATE,
  type LookUrlState,
  lookUrl,
  parseLookParams,
  writeLookParams,
} from '../src/debug/lookUrl.ts';
import { setAutoToneWeight } from '../src/render/autoTone.ts';
import { hotCheckUniform } from '../src/render/hotCheck.ts';
import { FakeMood } from './fakeMood.ts';
import { FakeShadows } from './fakeShadows.ts';

const parse = (query: string) => parseLookParams(new URLSearchParams(query));
const write = (query: string, state: LookUrlState) => writeLookParams(new URLSearchParams(query), state).toString();

describe('look URL parameters', () => {
  it('reads defaults from an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(parse('debug=1&site=testHouse&seed=7')).toEqual(DEFAULT_LOOK_URL_STATE);
  });

  it('omits defaults so the URL stays short', () => {
    expect(write('debug=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
  });

  it('has the game look as its defaults', () => {
    expect(DEFAULT_LOOK_URL_STATE).toEqual({
      tone: 'auto',
      exposure: 3,
      srgb: true,
      patterns: true,
      vao: true,
      freeze: false,
      post: true,
      bloom: true,
      film: true,
      grade: 1,
      bloomClip: null,
      fogginess: 0.2,
      torch: 1,
      shadows: { sun: true, torch: true, distance: 40 },
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
      srgb: false,
      patterns: false,
      vao: false,
      freeze: true,
      post: false,
      bloom: false,
      film: false,
      grade: 0.6,
      bloomClip: 3.5,
      fogginess: 0.7,
      torch: 1.56,
      shadows: { sun: false, torch: false, distance: 64 },
      crackCheck: true,
      hotCheck: true,
    };
    expect(write('', state)).toBe(
      'tone=none&exposure=1.4&srgb=0&patterns=0&vao=0&freeze=1&post=0&bloom=0&bloomclip=3.5&film=0&grade=0.6&fog=0.7&torch=1.56&sunshadow=0&torchshadow=0&shadowdist=64&crackcheck=1&hotcheck=1',
    );
    expect(parse(write('', state))).toEqual(state);
  });

  it('keeps both shadows on unless sunshadow=0 / torchshadow=0, and omits the defaults', () => {
    expect(parse('sunshadow=0').shadows).toEqual({ sun: false, torch: true, distance: 40 });
    expect(parse('torchshadow=0').shadows).toEqual({ sun: true, torch: false, distance: 40 });
    expect(parse('sunshadow=1&torchshadow=off').shadows).toEqual(DEFAULT_LOOK_URL_STATE.shadows);
    expect(write('debug=1&sunshadow=0&torchshadow=0&shadowdist=64', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    const state = (shadows: LookUrlState['shadows']): LookUrlState => ({ ...DEFAULT_LOOK_URL_STATE, shadows });
    expect(write('debug=1', state({ sun: false, torch: true, distance: 40 }))).toBe('debug=1&sunshadow=0');
    expect(write('debug=1', state({ sun: true, torch: false, distance: 40 }))).toBe('debug=1&torchshadow=0');
  });

  it('clamps the shadow distance to whole metres within 16..96 and ignores nonsense', () => {
    expect(parse('shadowdist=24').shadows.distance).toBe(24);
    expect(parse('shadowdist=33.6').shadows.distance).toBe(34);
    expect(parse('shadowdist=1').shadows.distance).toBe(16);
    expect(parse('shadowdist=500').shadows.distance).toBe(96);
    expect(parse('shadowdist=').shadows.distance).toBe(40);
    expect(parse('shadowdist=abc').shadows.distance).toBe(40);
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, shadows: { sun: true, torch: true, distance: 24 } })).toBe(
      'shadowdist=24',
    );
  });

  it('records only deviations from the defaults', () => {
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, srgb: false })).toBe('srgb=0');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'none' })).toBe('tone=none');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, exposure: 1 })).toBe('exposure=1.0');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, fogginess: 0 })).toBe('fog=0.0');
    // The old defaults' spellings are now just noise: they read as the default and are dropped.
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

  it('keeps the mood pass on unless a parameter turns a part off, and omits the defaults', () => {
    expect(parse('')).toMatchObject({ post: true, bloom: true, film: true, grade: 1 });
    expect(parse('post=0&bloom=0&film=0')).toMatchObject({ post: false, bloom: false, film: false });
    expect(parse('post=1&bloom=off&film=')).toMatchObject({ post: true, bloom: true, film: true });
    expect(write('debug=1&post=0&bloom=0&film=0&grade=0.4', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloom: false })).toBe('debug=1&bloom=0');
  });

  it('follows the tone mapper unless bloomclip overrides it, clamping to 1..8 in tenths', () => {
    expect(parse('').bloomClip).toBeNull();
    expect(parse('bloomclip=3.5').bloomClip).toBe(3.5);
    expect(parse('bloomclip=3.26').bloomClip).toBe(3.3);
    expect(parse('bloomclip=0.2').bloomClip).toBe(1);
    expect(parse('bloomclip=50').bloomClip).toBe(8);
    expect(parse('bloomclip=').bloomClip).toBeNull();
    expect(parse('bloomclip=abc').bloomClip).toBeNull();
  });

  it('reads the tone mapper own clip as no override, and writes an override only when it differs', () => {
    // aces derives 2, agx 5 (BLOOM_CLIP_BY_TONE): spelling out the value in effect is just noise.
    expect(parse('tone=aces&bloomclip=2').bloomClip).toBeNull();
    expect(parse('tone=agx&bloomclip=5').bloomClip).toBeNull();
    expect(parse('tone=agx&bloomclip=2').bloomClip).toBe(2);
    expect(write('debug=1&bloomclip=3', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloomClip: 3 })).toBe('debug=1&bloomclip=3.0');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, tone: 'aces', bloomClip: 2 })).toBe('debug=1&tone=aces');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'agx', bloomClip: 2 })).toBe('tone=agx&bloomclip=2.0');
  });

  it('keeps any bloomclip under auto, whose own clip moves with the time of day', () => {
    // 1.1 is the Neutral end of auto's range, 2 the ACES end: both are real overrides at some hour.
    expect(parse('bloomclip=1.1').bloomClip).toBe(1.1);
    expect(parse('bloomclip=2').bloomClip).toBe(2);
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloomClip: 2 })).toBe('debug=1&bloomclip=2.0');
  });

  it('reads the flashlight multiplier within 0.1..16 in hundredths, and writes it only when not 1', () => {
    expect(parse('').torch).toBe(1);
    expect(parse('torch=2.5').torch).toBe(2.5);
    expect(parse('torch=1.567').torch).toBe(1.57);
    expect(parse('torch=0').torch).toBe(0.1);
    expect(parse('torch=99').torch).toBe(16);
    expect(parse('torch=').torch).toBe(1);
    expect(parse('torch=abc').torch).toBe(1);
    expect(write('debug=1&torch=3', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, torch: 0.64 })).toBe('debug=1&torch=0.64');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, torch: 4 })).toBe('torch=4');
  });

  it('clamps fogginess to 0..1 in tenths and ignores nonsense', () => {
    expect(parse('fog=0').fogginess).toBe(0);
    expect(parse('fog=0.34').fogginess).toBe(0.3);
    expect(parse('fog=7').fogginess).toBe(1);
    expect(parse('fog=-1').fogginess).toBe(0);
    expect(parse('fog=').fogginess).toBe(0.2);
    expect(parse('fog=abc').fogginess).toBe(0.2);
  });

  it('keeps colour decode on unless srgb=0', () => {
    expect(parse('srgb=0').srgb).toBe(false);
    expect(parse('srgb=1').srgb).toBe(true);
    expect(parse('srgb=off').srgb).toBe(true);
  });

  it('clamps the grade to 0..1 in tenths and ignores nonsense', () => {
    expect(parse('grade=0').grade).toBe(0);
    expect(parse('grade=0.34').grade).toBe(0.3);
    expect(parse('grade=7').grade).toBe(1);
    expect(parse('grade=-2').grade).toBe(0);
    expect(parse('grade=').grade).toBe(1);
    expect(parse('grade=abc').grade).toBe(1);
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, grade: 0 })).toBe('grade=0.0');
  });

  it('keeps surface patterns on unless patterns=0', () => {
    expect(parse('patterns=0').patterns).toBe(false);
    expect(parse('patterns=1').patterns).toBe(true);
    expect(parse('patterns=off').patterns).toBe(true);
    expect(write('debug=1&patterns=0', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, patterns: false })).toBe('debug=1&patterns=0');
  });

  it('keeps wide ambient occlusion on unless vao=0', () => {
    expect(parse('vao=0').vao).toBe(false);
    expect(parse('vao=1').vao).toBe(true);
    expect(parse('vao=off').vao).toBe(true);
    expect(write('debug=1&vao=0', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, vao: false })).toBe('debug=1&vao=0');
  });

  it('keeps the game freeze only while it is on', () => {
    expect(parse('freeze=1').freeze).toBe(true);
    expect(parse('freeze=true').freeze).toBe(false);
    expect(write('debug=1&freeze=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, freeze: true })).toBe('debug=1&freeze=1');
  });

  it('ignores invalid values instead of throwing', () => {
    expect(parse('tone=sepia&exposure=abc&srgb=yes&freeze=yes')).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(parse('exposure=&tone=')).toEqual(DEFAULT_LOOK_URL_STATE);
    expect(parse('exposure=Infinity').exposure).toBe(3);
  });

  it('clamps exposure as the keys do and rounds to a tenth', () => {
    expect(parse('exposure=9').exposure).toBe(3);
    expect(parse('exposure=0').exposure).toBe(0.2);
    expect(parse('exposure=1.26').exposure).toBe(1.3);
  });

  it('replaces only its own parameters and keeps the rest, path and hash', () => {
    const state: LookUrlState = { ...DEFAULT_LOOK_URL_STATE, tone: 'agx' };
    expect(write('debug=1&tone=none&seed=5&exposure=2&time=20%3A30&site=testHouse', state)).toBe(
      'debug=1&seed=5&time=20%3A30&site=testHouse&tone=agx',
    );
    expect(lookUrl('http://localhost:5173/play?debug=1&time=20:30&srgb=0#x', state)).toBe(
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
      weather,
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.restore(parse('post=0&bloom=0&film=0&grade=0.5&fog=0.6'));
    expect(look.moodState).toEqual({ post: false, bloom: false, film: false, grade: 0.5, bloomClip: null });
    expect(mood.grade).toBe(0.5);
    expect(weather.fogginess).toBe(0.6);
  });

  it('takes the parsed bloom clip and flashlight strength, and steps them', () => {
    const mood = new FakeMood();
    const flashlight = { strength: 1 };
    const game = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, mood, {
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
    expect([mood.bloomClip, look.bloomClip, look.bloomClipIsDefault, flashlight.strength]).toEqual([null, 2, true, 1]);
    // Stepping from the derived value overrides it; stepping back onto it follows the tone mapper again.
    look.stepBloomClip(1);
    expect([mood.bloomClip, look.moodState.bloomClip]).toEqual([2.5, 2.5]);
    look.stepBloomClip(-1);
    expect(mood.bloomClip).toBeNull();
    look.stepBloomClip(-10);
    expect(mood.bloomClip).toBe(1);
    look.stepBloomClip(100);
    expect(mood.bloomClip).toBe(8);
    look.stepTorch(1);
    expect(flashlight.strength).toBe(1.25);
    look.stepTorch(-1);
    expect(flashlight.strength).toBe(1);
    look.stepTorch(-100);
    expect(flashlight.strength).toBe(0.1);
    look.stepTorch(100);
    expect(flashlight.strength).toBe(16);
  });

  it('takes the parsed diagnostic checks and toggles them', () => {
    const mood = new FakeMood();
    const look = new LookControls(renderer, meshes, mood, {
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
    expect([game.toneMapping, game.toneMappingExposure]).toEqual([CustomToneMapping, 3]);
  });

  it('shows auto with the sky weight, and follows it for the bloom clip', () => {
    const mood = new FakeMood();
    const game = { toneMapping: CustomToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, mood, {
      weather: { fogginess: 0.2 },
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    setAutoToneWeight(0.85);
    expect([look.toneKey, look.toneMappingName]).toEqual(['auto', 'Auto (0.85)']);
    expect(look.bloomClip).toBeCloseTo(1.1 + 0.9 * 0.85, 12);
    expect(look.bloomClipIsDefault).toBe(true);
    setAutoToneWeight(0);
    expect(look.bloomClip).toBeCloseTo(1.1, 12);
    // Stepping overrides; stepping back onto the live value (to a tenth) follows it again.
    look.stepBloomClip(1);
    expect(mood.bloomClip).toBe(1.6);
    look.stepBloomClip(-1);
    expect(mood.bloomClip).toBeNull();
    setAutoToneWeight(0);
  });

  it('steps fogginess by tenths within 0..1', () => {
    const weather = { fogginess: 0.2 };
    const look = new LookControls(renderer, meshes, new FakeMood(), {
      weather,
      shadows: new FakeShadows(),
      flashlight: { strength: 1 },
    });
    look.stepFogginess(1);
    expect(weather.fogginess).toBe(0.3);
    look.stepFogginess(-20);
    expect(weather.fogginess).toBe(0);
    look.stepFogginess(20);
    expect(weather.fogginess).toBe(1);
  });
});
