// Debug look settings as URL query parameters, so a look survives a reload and can be shared.
// Only the debug tools read or write these (`?debug=1`); every other parameter is left alone.
// Absent parameters mean the game's default look (DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_FOGGINESS), and
// only deviations from it are written.
//
//   tone=none|agx|aces|neutral   tone mapping (J); omitted for aces
//   exposure=<0.2..3.0>          exposure in tenths (- =); omitted for 3; out of range is clamped
//   srgb=0                       block colours left undecoded (I); omitted when decoded, which is the default
//   patterns=0                   surface patterns off (;); omitted when on, which is the default
//   freeze=1                     whole game frozen (M), so a reload resumes frozen; omitted when off
//   post=0                       whole mood pass off (Q): no bloom, grade, film or height fog; omitted when on
//   bloom=0                      bloom off (');  omitted when on
//   film=0                       vignette and grain off (\); omitted when on
//   grade=<0..1>                 colour grade strength in tenths ([ ]); omitted for 1; 0 is no grade
//   fog=<0..1>                   fogginess in tenths (L /); omitted for 0.2; 0 is clear, 1 thick fog
//
// Unparseable values fall back to the default. The debug time-of-day override is not persisted.

import {
  clampExposure,
  clampGrade,
  DEFAULT_GRADE,
  DEFAULT_LOOK,
  DEFAULT_MOOD,
  type LookState,
  type MoodState,
} from '../core/mood.ts';
import { clampFogginess, DEFAULT_FOGGINESS } from '../core/weather.ts';
import { TONE_MODES } from '../render/look.ts';

export interface LookUrlState extends LookState, MoodState {
  fogginess: number;
  /** The debug game freeze (M). */
  freeze: boolean;
}

export const DEFAULT_LOOK_URL_STATE: LookUrlState = {
  ...DEFAULT_LOOK,
  ...DEFAULT_MOOD,
  fogginess: DEFAULT_FOGGINESS,
  freeze: false,
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
  'grade',
  'fog',
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
  const fogginess = numberParam(params, 'fog');
  return {
    post: params.get('post') !== '0',
    bloom: params.get('bloom') !== '0',
    film: params.get('film') !== '0',
    grade: Number.isFinite(grade) ? clampGrade(grade) : DEFAULT_GRADE,
    fogginess: Number.isFinite(fogginess) ? clampFogginess(fogginess) : DEFAULT_FOGGINESS,
    tone: TONE_MODES.some((mode) => mode.key === tone) ? tone : DEFAULT_LOOK.tone,
    exposure: Number.isFinite(exposure) ? clampExposure(exposure) : DEFAULT_LOOK.exposure,
    srgb: params.get('srgb') !== '0',
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
  if (state.tone !== DEFAULT_LOOK.tone) {
    next.set('tone', state.tone);
  }
  if (state.exposure !== DEFAULT_LOOK.exposure) {
    next.set('exposure', state.exposure.toFixed(1));
  }
  if (!state.srgb) {
    next.set('srgb', '0');
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
  if (state.grade !== DEFAULT_GRADE) {
    next.set('grade', state.grade.toFixed(1));
  }
  if (state.fogginess !== DEFAULT_FOGGINESS) {
    next.set('fog', state.fogginess.toFixed(1));
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
