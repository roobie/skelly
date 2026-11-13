// Debug look settings in the page hash, so a look survives a reload and can be shared.
// Only the debug tools read or write these; every other hash key is left alone.
// An absent key means the default look, which is content: the `look` section for tone, exposure and the
// mood pass, the day cycle's default weather for fog, clouds and rain, and the code defaults for the rest;
// only deviations from it are written. Each key's control is named in the debug panel's catalogue, and its value type in
// `src/hashState.ts`, `HASH_KEYS`. Numbers are clamped to their control's range, and a bloom clip equal to the
// tone mapper's own (`BLOOM_CLIP_BY_TONE`) is left out because it follows the tone mapper; under auto that
// value moves with the time of day, so it is never left out. The debug time-of-day override is not persisted.

import type { WeatheringDef } from '@skelly/engine/content';
import {
  AUTO_TONE,
  bloomClipFor,
  clampBloomClip,
  clampExposure,
  clampGrade,
  clampShadowDistance,
  clampTorch,
  DEFAULT_TORCH,
  defaultShadows,
  type LookDefaults,
  type LookState,
  lookOf,
  type MoodState,
  moodOf,
  type ShadowState,
  type SunShadowTuning,
} from '@skelly/engine/look';
import {
  clampWeatherLevel,
  WEATHERING_TUNING_KEYS,
  type Weather,
  type WeatheringUrlState,
  writeWeatheringParams,
} from '@skelly/engine/sky';
import { TONE_MODES } from '@skelly/presentation/render';
import type { HashState } from '../hashState.ts';

export interface LookUrlState extends LookState, MoodState {
  weather: Weather;
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

/** What the written keys are measured against: the content's default look and weather, and the weathering state to write. */
export interface LookUrlDefaults {
  look: LookDefaults;
  defaultWeather: Weather;
  sunShadow: SunShadowTuning;
  weathering?: WeatheringUrlState | undefined;
  profiles?: ReadonlyMap<string, WeatheringDef>;
}

/** The state no key departs from: the content's look and weather, and the code's defaults for the rest. */
export const defaultLookUrlState = ({ look, defaultWeather, sunShadow }: LookUrlDefaults): LookUrlState => ({
  ...lookOf(look),
  ...moodOf(look),
  weather: { ...defaultWeather },
  torch: DEFAULT_TORCH,
  shadows: defaultShadows(sunShadow),
  freeze: false,
  crackCheck: false,
  hotCheck: false,
});

/** The hash keys the look owns: the look switches and the weathering edits. */
export const LOOK_KEYS = [
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
  'clouds',
  'rain',
  'torch',
  'sunshadow',
  'torchshadow',
  'shadowdist',
  'crackcheck',
  'hotcheck',
  ...WEATHERING_TUNING_KEYS,
] as const satisfies readonly (keyof HashState)[];

/** The tone mapper's own bloom clip when it is one value; null for `auto`, whose clip moves with the time of day, so any override is kept. */
const fixedBloomClip = (tone: string): number | null => (tone === AUTO_TONE ? null : bloomClipFor(tone));

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);

/** Both shadows stay on unless the hash turns one off. */
const shadowsOf = (hash: HashState, sunShadow: SunShadowTuning): ShadowState => ({
  sun: hash.sunshadow ?? true,
  torch: hash.torchshadow ?? true,
  distance: clampShadowDistance(hash.shadowdist ?? Number.NaN, sunShadow),
});

export const parseLookParams = (hash: HashState, defaults: LookUrlDefaults): LookUrlState => {
  const base = defaultLookUrlState(defaults);
  const toneKey = TONE_MODES.some((mode) => mode.key === hash.tone) ? hash.tone! : base.tone;
  const clip = finite(hash.bloomclip) ? clampBloomClip(hash.bloomclip) : null;
  return {
    post: hash.post ?? base.post,
    bloom: hash.bloom ?? base.bloom,
    film: hash.film ?? base.film,
    grade: finite(hash.grade) ? clampGrade(hash.grade) : base.grade,
    // The tone mapper's own value is not an override: it keeps following the tone mapper.
    bloomClip: clip === fixedBloomClip(toneKey) ? null : clip,
    weather: {
      fogginess: finite(hash.fog) ? clampWeatherLevel(hash.fog) : base.weather.fogginess,
      cloudiness: finite(hash.clouds) ? clampWeatherLevel(hash.clouds) : base.weather.cloudiness,
      rain: finite(hash.rain) ? clampWeatherLevel(hash.rain) : base.weather.rain,
    },
    torch: clampTorch(hash.torch ?? Number.NaN),
    tone: toneKey,
    exposure: finite(hash.exposure) ? clampExposure(hash.exposure) : base.exposure,
    srgb: hash.srgb ?? base.srgb,
    patterns: hash.patterns ?? base.patterns,
    vao: hash.vao ?? base.vao,
    shadows: shadowsOf(hash, defaults.sunShadow),
    freeze: hash.freeze === true,
    crackCheck: hash.crackcheck === true,
    hotCheck: hash.hotcheck === true,
  };
};

/** A value kept to the tenth its control steps in, so the written text stays short. */
const tenths = (value: number): number => Number(value.toFixed(1));

/** `hash` with the look keys replaced by `state`'s non-default ones and the weathering edits. */
export const writeLookParams = (hash: HashState, state: LookUrlState, defaults: LookUrlDefaults): HashState => {
  const base = defaultLookUrlState(defaults);
  const next: Record<string, unknown> = { ...hash };
  for (const key of LOOK_KEYS) {
    delete next[key];
  }
  const set = <Key extends keyof HashState>(key: Key, value: HashState[Key], unchanged: boolean): void => {
    if (!unchanged) {
      next[key] = value;
    }
  };
  set('tone', state.tone, state.tone === base.tone);
  set('exposure', tenths(state.exposure), state.exposure === base.exposure);
  set('srgb', state.srgb, state.srgb === base.srgb);
  set('patterns', state.patterns, state.patterns === base.patterns);
  set('vao', state.vao, state.vao === base.vao);
  set('freeze', true, !state.freeze);
  set('post', state.post, state.post === base.post);
  set('bloom', state.bloom, state.bloom === base.bloom);
  set(
    'bloomclip',
    tenths(state.bloomClip ?? 0),
    state.bloomClip === null || state.bloomClip === fixedBloomClip(state.tone),
  );
  set('film', state.film, state.film === base.film);
  set('grade', tenths(state.grade), state.grade === base.grade);
  set('fog', tenths(state.weather.fogginess), state.weather.fogginess === base.weather.fogginess);
  set('clouds', tenths(state.weather.cloudiness), state.weather.cloudiness === base.weather.cloudiness);
  set('rain', tenths(state.weather.rain), state.weather.rain === base.weather.rain);
  set('torch', state.torch, state.torch === DEFAULT_TORCH);
  set('sunshadow', false, state.shadows.sun);
  set('torchshadow', false, state.shadows.torch);
  set('shadowdist', state.shadows.distance, state.shadows.distance === base.shadows.distance);
  set('crackcheck', true, !state.crackCheck);
  set('hotcheck', true, !state.hotCheck);
  return {
    ...(next as HashState),
    ...writeWeatheringParams(defaults.weathering, defaults.profiles ?? new Map()),
  };
};
