import { ACESFilmicToneMapping, NoToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { LookControls } from '../src/debug/look.ts';
import {
  DEFAULT_LOOK_URL_STATE,
  type LookUrlState,
  lookUrl,
  parseLookParams,
  writeLookParams,
} from '../src/debug/lookUrl.ts';
import { FakeMood } from './fakeMood.ts';

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
      tone: 'aces',
      exposure: 3,
      srgb: true,
      patterns: true,
      freeze: false,
      post: true,
      bloom: true,
      film: true,
      grade: 1,
      fogginess: 0.2,
    });
  });

  it('round-trips a state', () => {
    const state: LookUrlState = {
      tone: 'none',
      exposure: 1.4,
      srgb: false,
      patterns: false,
      freeze: true,
      post: false,
      bloom: false,
      film: false,
      grade: 0.6,
      fogginess: 0.7,
    };
    expect(write('', state)).toBe(
      'tone=none&exposure=1.4&srgb=0&patterns=0&freeze=1&post=0&bloom=0&film=0&grade=0.6&fog=0.7',
    );
    expect(parse(write('', state))).toEqual(state);
  });

  it('records only deviations from the defaults', () => {
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, srgb: false })).toBe('srgb=0');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, tone: 'none' })).toBe('tone=none');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, exposure: 1 })).toBe('exposure=1.0');
    expect(write('', { ...DEFAULT_LOOK_URL_STATE, fogginess: 0 })).toBe('fog=0.0');
    // The old defaults' spellings are now just noise: they read as the default and are dropped.
    expect(write('debug=1&tone=aces&exposure=3&fog=0.2&grade=1', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
  });

  it('keeps the mood pass on unless a parameter turns a part off, and omits the defaults', () => {
    expect(parse('')).toMatchObject({ post: true, bloom: true, film: true, grade: 1 });
    expect(parse('post=0&bloom=0&film=0')).toMatchObject({ post: false, bloom: false, film: false });
    expect(parse('post=1&bloom=off&film=')).toMatchObject({ post: true, bloom: true, film: true });
    expect(write('debug=1&post=0&bloom=0&film=0&grade=0.4', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, bloom: false })).toBe('debug=1&bloom=0');
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
  };

  it('takes the parsed tone, exposure, colour decode and patterns', () => {
    const look = new LookControls(renderer, meshes, new FakeMood(), { fogginess: 0.2 });
    look.restore(parse('tone=neutral&exposure=2.5&srgb=1&patterns=0'));
    expect([look.toneKey, look.exposure, look.linearColors, look.patterns]).toEqual(['neutral', 2.5, true, false]);
  });

  it('takes the parsed mood pass and fogginess', () => {
    const mood = new FakeMood();
    const weather = { fogginess: 0.2 };
    const look = new LookControls(renderer, meshes, mood, weather);
    look.restore(parse('post=0&bloom=0&film=0&grade=0.5&fog=0.6'));
    expect(look.moodState).toEqual({ post: false, bloom: false, film: false, grade: 0.5 });
    expect(mood.grade).toBe(0.5);
    expect(weather.fogginess).toBe(0.6);
  });

  it('follows the renderer it finds, so the game default look survives attaching the controls', () => {
    const game = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 3 };
    const look = new LookControls(game, meshes, new FakeMood(), { fogginess: 0.2 });
    expect([look.toneKey, look.toneMappingName, game.toneMapping, game.toneMappingExposure]).toEqual([
      'aces',
      'ACES Filmic',
      ACESFilmicToneMapping,
      3,
    ]);
    look.restore(DEFAULT_LOOK_URL_STATE);
    expect([game.toneMapping, game.toneMappingExposure]).toEqual([ACESFilmicToneMapping, 3]);
  });

  it('steps fogginess by tenths within 0..1', () => {
    const weather = { fogginess: 0.2 };
    const look = new LookControls(renderer, meshes, new FakeMood(), weather);
    look.stepFogginess(1);
    expect(weather.fogginess).toBe(0.3);
    look.stepFogginess(-20);
    expect(weather.fogginess).toBe(0);
    look.stepFogginess(20);
    expect(weather.fogginess).toBe(1);
  });
});
