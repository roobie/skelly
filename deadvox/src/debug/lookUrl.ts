// Debug look settings as URL query parameters, so a look survives a reload and can be shared.
// Only the debug tools read or write these (`?debug=1`); every other parameter is left alone.
// Absent parameters mean the game's default look (DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_FOGGINESS), and
// only deviations from it are written.
//
//   tone=none|agx|aces|neutral|auto  tone mapping (J); omitted for auto (Neutral by day, ACES by night, by the sky)
//   exposure=<0.2..3.0>          exposure in tenths (- =); omitted for 3; out of range is clamped
//   srgb=0                       block colours left undecoded (I); omitted when decoded, which is the default
//   patterns=0                   surface patterns off (;); omitted when on, which is the default
//   vao=0                        wide ambient occlusion off (9); omitted when on, which is the default
//   freeze=1                    whole game frozen (M), so a reload resumes frozen; omitted when off
//   post=0                       whole mood pass off (Q): no bloom, grade, film or height fog; omitted when on
//   bloom=0                      bloom off (');  omitted when on
//   bloomclip=<1..8>             bloom clip, the post-exposure value where bloom starts, in tenths (Delete Insert);
//                                omitted for the tone mapper's own value (BLOOM_CLIP_BY_TONE), which it follows;
//                                under auto that value moves with the time of day, so it is never omitted
//   film=0                       vignette and grain off (\); omitted when on
//   grade=<0..1>                 colour grade strength in tenths ([ ]); omitted for 1; 0 is no grade
//   torch=<0.1..16>              flashlight intensity multiplier in hundredths (numpad - +); omitted for 1
//   fog=<0..1>                   fogginess in tenths (L /); omitted for 0.2; 0 is clear, 1 thick fog
//   sunshadow=0                  sun shadows off (0); omitted when on, which is the default
//   torchshadow=0                flashlight shadows off (Home); omitted when on, which is the default
//   shadowdist=<16..96>          the sun's shadow distance in metres (PageUp steps 24, 40, 64); omitted for 40
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
  DEFAULT_GRADE,
  DEFAULT_LOOK,
  DEFAULT_MOOD,
  DEFAULT_SHADOWS,
  DEFAULT_TORCH,
  type LookState,
  type MoodState,
  type ShadowState,
} from '../core/mood.ts';
import { clampFogginess, DEFAULT_FOGGINESS } from '../core/weather.ts';
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

export const DEFAULT_LOOK_URL_STATE: LookUrlState = {
  ...DEFAULT_LOOK,
  ...DEFAULT_MOOD,
  fogginess: DEFAULT_FOGGINESS,
  torch: DEFAULT_TORCH,
  shadows: DEFAULT_SHADOWS,
  freeze: false,
  crackCheck: false,
  hotCheck: false,
};

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
] as const;

/** The tone mapper's own bloom clip when it is one value; null for `auto`, whose clip moves with the time of day, so any override is kept. */
const fixedBloomClip = (tone: string): number | null => (tone === AUTO_TONE ? null : bloomClipFor(tone));

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
  const shadowDistance = numberParam(params, 'shadowdist');
  const bloomClip = numberParam(params, 'bloomclip');
  const toneKey = TONE_MODES.some((mode) => mode.key === tone) ? tone : DEFAULT_LOOK.tone;
  const clip = Number.isFinite(bloomClip) ? clampBloomClip(bloomClip) : null;
  return {
    post: params.get('post') !== '0',
    bloom: params.get('bloom') !== '0',
    film: params.get('film') !== '0',
    grade: Number.isFinite(grade) ? clampGrade(grade) : DEFAULT_GRADE,
    // The tone mapper's own value is not an override: it keeps following the tone mapper.
    bloomClip: clip === fixedBloomClip(toneKey) ? null : clip,
    fogginess: Number.isFinite(fogginess) ? clampFogginess(fogginess) : DEFAULT_FOGGINESS,
    torch: clampTorch(numberParam(params, 'torch')),
    tone: toneKey,
    exposure: Number.isFinite(exposure) ? clampExposure(exposure) : DEFAULT_LOOK.exposure,
    srgb: params.get('srgb') !== '0',
    patterns: params.get('patterns') !== '0',
    vao: params.get('vao') !== '0',
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

/** The mood pass's non-default settings. A bloom clip equal to the tone mapper's own is the default and left out. */
const writeMoodParams = (next: URLSearchParams, state: LookUrlState): void => {
  if (!state.post) {
    next.set('post', '0');
  }
  if (!state.bloom) {
    next.set('bloom', '0');
  }
  if (state.bloomClip !== null && state.bloomClip !== fixedBloomClip(state.tone)) {
    next.set('bloomclip', state.bloomClip.toFixed(1));
  }
  if (!state.film) {
    next.set('film', '0');
  }
  if (state.grade !== DEFAULT_GRADE) {
    next.set('grade', state.grade.toFixed(1));
  }
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
  if (!state.vao) {
    next.set('vao', '0');
  }
  if (state.freeze) {
    next.set('freeze', '1');
  }
  writeMoodParams(next, state);
  if (state.fogginess !== DEFAULT_FOGGINESS) {
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
  return next;
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
export const lookUrl = (href: string, state: LookUrlState): string => {
  const url = new URL(href);
  // ':' is legal in a query, and a kept `time=20:30` reads better than `time=20%3A30`.
  url.search = writeLookParams(url.searchParams, state).toString().replace(/%3A/g, ':');
  return url.toString();
};
