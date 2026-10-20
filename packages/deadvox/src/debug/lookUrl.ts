// Debug look settings as URL query parameters, so a look survives a reload and can be shared.
// Only the debug tools read or write these (`?debug=1`); every other parameter is left alone.
// Absent parameters mean the default look, which is content: the `look` section for tone, exposure and the
// mood pass, the day cycle's default fogginess for fog, and the code defaults for the rest; only deviations
// from it are written. A switch is written as `1` or `0`, whichever differs from the default.
//
//   tone=none|agx|aces|neutral|auto  tone mapping (J); auto is Neutral by day, ACES by night, by the sky
//   exposure=<0.2..3.0>          exposure in tenths (- =); out of range is clamped
//   srgb=0|1                     block colours decoded or left undecoded (I)
//   patterns=0|1                 surface patterns (;)
//   vao=0|1                      wide ambient occlusion (9)
//   freeze=1                    whole game frozen (M), so a reload resumes frozen; omitted when off
//   post=0|1                     whole mood pass (Q): bloom, grade, film and height fog
//   bloom=0|1                    bloom (')
//   bloomclip=<1..8>             bloom clip, the post-exposure value where bloom starts, in tenths (Delete Insert);
//                                omitted for the tone mapper's own value (BLOOM_CLIP_BY_TONE), which it follows;
//                                under auto that value moves with the time of day, so it is never omitted
//   film=0|1                     vignette and grain (\)
//   grade=<0..1>                 colour grade strength in tenths ([ ]); 0 is no grade
//   torch=<0.1..16>              flashlight intensity multiplier in hundredths (numpad - +); omitted for 1
//   fog=<0..1>                   fogginess in tenths (L /); omitted for 0.2; 0 is clear, 1 thick fog
//   sunshadow=0                  sun shadows off (0); omitted when on, which is the default
//   torchshadow=0                flashlight shadows off (Home); omitted when on, which is the default
//   shadowdist=<metres>           sun shadow distance in metres (PageUp steps through `SHADOW_DISTANCES`);
//                                omitted for the default (`DEFAULT_SHADOWS`)
//   crackcheck=1                 background drawn magenta, fog on geometry unchanged (End); omitted when off
//   hotcheck=1                   NaN / negative / over-bright lit fragments painted per material (legend in the panel; PageDown); omitted when off
//
// Unparseable values fall back to the default. The debug time-of-day override is not persisted.

import {
  AUTO_TONE,
  bloomClipFor,
  clampBloomClip,
  clampExposure,
  clampGrade,
  clampShadowDistance,
  clampTorch,
  DEFAULT_SHADOWS,
  DEFAULT_TORCH,
  type LookDefaults,
  type LookState,
  lookOf,
  type MoodState,
  moodOf,
  type ShadowState,
} from '../core/mood.ts';
import type { WeatheringDef } from '../core/schema.ts';
import { clampFogginess } from '../core/weather.ts';
import { WEATHERING_URL_PARAMS, type WeatheringUrlState, writeWeatheringParams } from '../core/weatheringUrl.ts';
import { TONE_MODES } from '../render/look.ts';

export interface LookUrlState extends LookState, MoodState {
  fogginess: number;
  /** Flashlight intensity multiplier. */
  torch: number;
  shadows: ShadowState;
  /** The debug game freeze (M). */
  freeze: boolean;
  /** Background drawn magenta, to find holes in the world (End). */
  crackCheck: boolean;
  /** Hot fragments drawn cyan (PageDown). */
  hotCheck: boolean;
}

/** What the written parameters are measured against: the content's default look and fogginess, and the weathering state to write. */
export interface LookUrlDefaults {
  look: LookDefaults;
  defaultFogginess: number;
  weathering?: WeatheringUrlState | undefined;
  profiles?: ReadonlyMap<string, WeatheringDef>;
}

/** The state no parameter departs from: the content's look and fogginess, and the code's defaults for the rest. */
export const defaultLookUrlState = ({ look, defaultFogginess }: LookUrlDefaults): LookUrlState => ({
  ...lookOf(look),
  ...moodOf(look),
  fogginess: defaultFogginess,
  torch: DEFAULT_TORCH,
  shadows: DEFAULT_SHADOWS,
  freeze: false,
  crackCheck: false,
  hotCheck: false,
});

export const LOOK_PARAMS = [
  'tone',
  'exposure',
  'srgb',
  'patterns',
  'vao',
  'freeze',
  'post',
  'bloom',
  'bloomclip',
  'film',
  'grade',
  'fog',
  'torch',
  'sunshadow',
  'torchshadow',
  'shadowdist',
  'crackcheck',
  'hotcheck',
  ...WEATHERING_URL_PARAMS,
] as const;

/** The tone mapper's own bloom clip when it is one value; null for `auto`, whose clip moves with the time of day, so any override is kept. */
const fixedBloomClip = (tone: string): number | null => (tone === AUTO_TONE ? null : bloomClipFor(tone));

/** A number parameter, NaN when absent, blank or unparseable (Number('') is 0, which would pass as a value). */
const numberParam = (params: URLSearchParams, name: string): number => {
  const text = params.get(name);
  return text === null || text.trim() === '' ? Number.NaN : Number(text);
};

export const parseLookParams = (params: URLSearchParams, defaults: LookUrlDefaults): LookUrlState => {
  const base = defaultLookUrlState(defaults);
  const tone = params.get('tone') ?? '';
  const exposure = numberParam(params, 'exposure');
  const grade = numberParam(params, 'grade');
  const fogginess = numberParam(params, 'fog');
  const shadowDistance = numberParam(params, 'shadowdist');
  const bloomClip = numberParam(params, 'bloomclip');
  const toneKey = TONE_MODES.some((mode) => mode.key === tone) ? tone : base.tone;
  const clip = Number.isFinite(bloomClip) ? clampBloomClip(bloomClip) : null;
  return {
    post: flagParam(params, 'post', base.post),
    bloom: flagParam(params, 'bloom', base.bloom),
    film: flagParam(params, 'film', base.film),
    grade: Number.isFinite(grade) ? clampGrade(grade) : base.grade,
    // The tone mapper's own value is not an override: it keeps following the tone mapper.
    bloomClip: clip === fixedBloomClip(toneKey) ? null : clip,
    fogginess: Number.isFinite(fogginess) ? clampFogginess(fogginess) : base.fogginess,
    torch: clampTorch(numberParam(params, 'torch')),
    tone: toneKey,
    exposure: Number.isFinite(exposure) ? clampExposure(exposure) : base.exposure,
    srgb: flagParam(params, 'srgb', base.srgb),
    patterns: flagParam(params, 'patterns', base.patterns),
    vao: flagParam(params, 'vao', base.vao),
    shadows: {
      sun: params.get('sunshadow') !== '0',
      torch: params.get('torchshadow') !== '0',
      distance: clampShadowDistance(shadowDistance),
    },
    freeze: params.get('freeze') === '1',
    crackCheck: params.get('crackcheck') === '1',
    hotCheck: params.get('hotcheck') === '1',
  };
};

/** A switch parameter: `1` on, `0` off, anything else the default. */
const flagParam = (params: URLSearchParams, name: string, fallback: boolean): boolean => {
  const text = params.get(name);
  if (text === '1' || text === '0') {
    return text === '1';
  }
  return fallback;
};

const setFlagIfChanged = (next: URLSearchParams, name: string, value: boolean, fallback: boolean): void => {
  if (value !== fallback) {
    next.set(name, value ? '1' : '0');
  }
};

/** The mood pass's non-default settings. A bloom clip equal to the tone mapper's own is the default and left out. */
const writeMoodParams = (next: URLSearchParams, state: LookUrlState, base: LookUrlState): void => {
  setFlagIfChanged(next, 'post', state.post, base.post);
  setFlagIfChanged(next, 'bloom', state.bloom, base.bloom);
  if (state.bloomClip !== null && state.bloomClip !== fixedBloomClip(state.tone)) {
    next.set('bloomclip', state.bloomClip.toFixed(1));
  }
  setFlagIfChanged(next, 'film', state.film, base.film);
  if (state.grade !== base.grade) {
    next.set('grade', state.grade.toFixed(1));
  }
};

/** A copy of `params` with the look parameters replaced by `state`'s non-default ones. */
export const writeLookParams = (
  params: URLSearchParams,
  state: LookUrlState,
  defaults: LookUrlDefaults,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  const base = defaultLookUrlState(defaults);
  for (const name of LOOK_PARAMS) {
    next.delete(name);
  }
  if (state.tone !== base.tone) {
    next.set('tone', state.tone);
  }
  if (state.exposure !== base.exposure) {
    next.set('exposure', state.exposure.toFixed(1));
  }
  setFlagIfChanged(next, 'srgb', state.srgb, base.srgb);
  setFlagIfChanged(next, 'patterns', state.patterns, base.patterns);
  setFlagIfChanged(next, 'vao', state.vao, base.vao);
  if (state.freeze) {
    next.set('freeze', '1');
  }
  writeMoodParams(next, state, base);
  if (state.fogginess !== base.fogginess) {
    next.set('fog', state.fogginess.toFixed(1));
  }
  if (state.torch !== DEFAULT_TORCH) {
    next.set('torch', String(state.torch));
  }
  if (!state.shadows.sun) {
    next.set('sunshadow', '0');
  }
  if (!state.shadows.torch) {
    next.set('torchshadow', '0');
  }
  if (state.shadows.distance !== DEFAULT_SHADOWS.distance) {
    next.set('shadowdist', String(state.shadows.distance));
  }
  writeCheckParams(next, state);
  return writeWeatheringParams(next, defaults.weathering, defaults.profiles ?? new Map());
};

/** The diagnostic checks are written only when on. */
const writeCheckParams = (next: URLSearchParams, { crackCheck, hotCheck }: LookUrlState): void => {
  if (crackCheck) {
    next.set('crackcheck', '1');
  }
  if (hotCheck) {
    next.set('hotcheck', '1');
  }
};

/** `href` with the look parameters set from `state`; other parameters, path and hash are kept. */
export const lookUrl = (href: string, state: LookUrlState, defaults: LookUrlDefaults): string => {
  const url = new URL(href);
  // ':' is legal in a query, and a kept `time=20:30` reads better than `time=20%3A30`.
  url.search = writeLookParams(url.searchParams, state, defaults).toString().replace(/%3A/g, ':');
  return url.toString();
};
