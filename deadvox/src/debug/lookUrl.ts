// Debug look settings as URL query parameters, so a look survives a reload and can be shared.
// Only the debug tools read or write these (`?debug=1`); every other parameter is left alone.
//
//   tone=none|agx|aces|neutral   tone mapping (J); omitted for none
//   exposure=<0.2..3.0>          exposure in tenths (- =); omitted for 1; out of range is clamped
//   srgb=1                       block colours decoded from sRGB (I); omitted when off
//   patterns=0                   surface patterns off (;); omitted when on, which is the default
//   freeze=1                     whole game frozen (M), so a reload resumes frozen; omitted when off
//   post=0                       whole mood pass off (Q): no bloom, grade, film or height fog; omitted when on
//   bloom=0                      bloom off (');  omitted when on
//   film=0                       vignette and grain off (\); omitted when on
//   hfog=0                       height fog off (/); omitted when on
//   grade=<0..1>                 colour grade strength in tenths ([ ]); omitted for 1; 0 is no grade
//
// Unparseable values fall back to the default. The debug time-of-day override is not persisted.

import { clampGrade, DEFAULT_GRADE, DEFAULT_MOOD, type MoodState } from '../core/mood.ts';
import { clampExposure, DEFAULT_EXPOSURE, TONE_MODES } from './look.ts';

export interface LookUrlState extends MoodState {
  /** A `TONE_MODES` key. */
  tone: string;
  exposure: number;
  srgb: boolean;
  /** Procedural surface patterns on blocks (;). */
  patterns: boolean;
  /** The debug game freeze (M). */
  freeze: boolean;
}

export const DEFAULT_LOOK_URL_STATE: LookUrlState = {
  tone: TONE_MODES[0]!.key,
  exposure: DEFAULT_EXPOSURE,
  srgb: false,
  patterns: true,
  freeze: false,
  ...DEFAULT_MOOD,
};

const LOOK_PARAMS = [
  'tone',
  'exposure',
  'srgb',
  'patterns',
  'freeze',
  'post',
  'bloom',
  'film',
  'hfog',
  'grade',
] as const;

/** A number parameter, NaN when absent, blank or unparseable (Number('') is 0, which would pass as a value). */
const numberParam = (params: URLSearchParams, name: string): number => {
  const text = params.get(name);
  return text === null || text.trim() === '' ? Number.NaN : Number(text);
};

export const parseLookParams = (params: URLSearchParams): LookUrlState => {
  const tone = params.get('tone') ?? '';
  const exposure = numberParam(params, 'exposure');
  const grade = numberParam(params, 'grade');
  return {
    post: params.get('post') !== '0',
    bloom: params.get('bloom') !== '0',
    film: params.get('film') !== '0',
    heightFog: params.get('hfog') !== '0',
    grade: Number.isFinite(grade) ? clampGrade(grade) : DEFAULT_GRADE,
    tone: TONE_MODES.some((mode) => mode.key === tone) ? tone : DEFAULT_LOOK_URL_STATE.tone,
    exposure: Number.isFinite(exposure) ? clampExposure(exposure) : DEFAULT_EXPOSURE,
    srgb: params.get('srgb') === '1',
    patterns: params.get('patterns') !== '0',
    freeze: params.get('freeze') === '1',
  };
};

/** A copy of `params` with the look parameters replaced by `state`'s non-default ones. */
export const writeLookParams = (params: URLSearchParams, state: LookUrlState): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const name of LOOK_PARAMS) {
    next.delete(name);
  }
  if (state.tone !== DEFAULT_LOOK_URL_STATE.tone) {
    next.set('tone', state.tone);
  }
  if (state.exposure !== DEFAULT_EXPOSURE) {
    next.set('exposure', state.exposure.toFixed(1));
  }
  if (state.srgb) {
    next.set('srgb', '1');
  }
  if (!state.patterns) {
    next.set('patterns', '0');
  }
  if (state.freeze) {
    next.set('freeze', '1');
  }
  if (!state.post) {
    next.set('post', '0');
  }
  if (!state.bloom) {
    next.set('bloom', '0');
  }
  if (!state.film) {
    next.set('film', '0');
  }
  if (!state.heightFog) {
    next.set('hfog', '0');
  }
  if (state.grade !== DEFAULT_GRADE) {
    next.set('grade', state.grade.toFixed(1));
  }
  return next;
};

/** `href` with the look parameters set from `state`; other parameters, path and hash are kept. */
export const lookUrl = (href: string, state: LookUrlState): string => {
  const url = new URL(href);
  // ':' is legal in a query, and a kept `time=20:30` reads better than `time=20%3A30`.
  url.search = writeLookParams(url.searchParams, state).toString().replace(/%3A/g, ':');
  return url.toString();
};
