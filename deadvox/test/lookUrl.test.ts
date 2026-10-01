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

  it('round-trips a state', () => {
    const state: LookUrlState = {
      tone: 'aces',
      exposure: 1.4,
      srgb: true,
      patterns: false,
      freeze: true,
      post: false,
      bloom: false,
      film: false,
      heightFog: false,
      grade: 0.6,
    };
    expect(write('', state)).toBe(
      'tone=aces&exposure=1.4&srgb=1&patterns=0&freeze=1&post=0&bloom=0&film=0&hfog=0&grade=0.6',
    );
    expect(parse(write('', state))).toEqual(state);
  });

  it('keeps the mood pass on unless a parameter turns a part off, and omits the defaults', () => {
    expect(parse('')).toMatchObject({ post: true, bloom: true, film: true, heightFog: true, grade: 1 });
    expect(parse('post=0&bloom=0&film=0&hfog=0')).toMatchObject({
      post: false,
      bloom: false,
      film: false,
      heightFog: false,
    });
    expect(parse('post=1&bloom=off&film=&hfog=no')).toMatchObject({
      post: true,
      bloom: true,
      film: true,
      heightFog: true,
    });
    expect(write('debug=1&post=0&bloom=0&film=0&hfog=0&grade=0.4', DEFAULT_LOOK_URL_STATE)).toBe('debug=1');
    expect(write('debug=1', { ...DEFAULT_LOOK_URL_STATE, heightFog: false })).toBe('debug=1&hfog=0');
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
    expect(parse('exposure=Infinity').exposure).toBe(1);
  });

  it('clamps exposure as the keys do and rounds to a tenth', () => {
    expect(parse('exposure=9').exposure).toBe(3);
    expect(parse('exposure=0').exposure).toBe(0.2);
    expect(parse('exposure=1.26').exposure).toBe(1.3);
  });

  it('replaces only its own parameters and keeps the rest, path and hash', () => {
    const state: LookUrlState = { ...DEFAULT_LOOK_URL_STATE, tone: 'agx' };
    expect(write('debug=1&tone=aces&seed=5&exposure=2&time=20%3A30&site=testHouse', state)).toBe(
      'debug=1&seed=5&time=20%3A30&site=testHouse&tone=agx',
    );
    expect(lookUrl('http://localhost:5173/play?debug=1&time=20:30&srgb=1#x', state)).toBe(
      'http://localhost:5173/play?debug=1&time=20:30&tone=agx#x',
    );
  });
});

describe('restoring look controls from URL state', () => {
  const renderer = { toneMapping: 0 as never, toneMappingExposure: 1 };
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
    const look = new LookControls(renderer, meshes, new FakeMood());
    look.restore(parse('tone=neutral&exposure=2.5&srgb=1&patterns=0'));
    expect([look.toneKey, look.exposure, look.linearColors, look.patterns]).toEqual(['neutral', 2.5, true, false]);
  });

  it('takes the parsed mood pass', () => {
    const mood = new FakeMood();
    const look = new LookControls(renderer, meshes, mood);
    look.restore(parse('post=0&bloom=0&film=0&hfog=0&grade=0.5'));
    expect(look.moodState).toEqual({ post: false, bloom: false, film: false, heightFog: false, grade: 0.5 });
    expect(mood.grade).toBe(0.5);
  });
});
