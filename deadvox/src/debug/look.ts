// Live look controls for the deadvox/look-experiments workstream: they exist so
// different looks (tone mapping, exposure, block colour space, mood pass, fog) can be compared by
// eye against the game's default look (DEFAULT_LOOK in core/mood.ts), which play has already applied.

import type { WebGLRenderer } from 'three';
import {
  AUTO_TONE,
  bloomClipFor,
  clampBloomClip,
  clampExposure,
  clampGrade,
  clampTorch,
  DEFAULT_LOOK,
  DEFAULT_MOOD,
  DEFAULT_SHADOWS,
  type LookState,
  type MoodState,
  nextShadowDistance,
  type ShadowState,
  TORCH_STEP,
} from '../core/mood.ts';
import type { WeatheringDef } from '../core/schema.ts';
import { clampFogginess, WEATHERING_RANGES, type Weather } from '../core/weather.ts';
import { isWeatheringColor, type WeatheringUrlState } from '../core/weatheringUrl.ts';
import { autoToneUniforms } from '../render/autoTone.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import { hotCheckOn, setHotCheck } from '../render/hotCheck.ts';
import { applyLook, TONE_MODES } from '../render/look.ts';
import type { Mood } from '../render/mood.ts';
import type { Shadows } from '../render/shadows.ts';

const EXPOSURE_STEP = 0.1;
const GRADE_STEP = 0.1;
const FOGGINESS_STEP = 0.1;
// Coarser than the others: the clip's range is 1 to 8 and the derived values are 1 to 5.
const BLOOM_CLIP_STEP = 0.5;

type MoodControls = Pick<
  Mood,
  | 'post'
  | 'bloom'
  | 'film'
  | 'grade'
  | 'bloomClip'
  | 'crackCheck'
  | 'restore'
  | 'setPost'
  | 'setBloom'
  | 'setFilm'
  | 'setGrade'
  | 'setBloomClip'
  | 'setCrackCheck'
>;

type ShadowControls = Pick<Shadows, 'settings' | 'restore' | 'setSun' | 'setTorch' | 'stepDistance'>;

type LookRenderer = Pick<WebGLRenderer, 'toneMapping' | 'toneMappingExposure'>;
type LookMeshes = Pick<
  ChunkMeshes,
  'linearColorsOn' | 'setLinearColors' | 'patternsOn' | 'setPatterns' | 'occlusionOn' | 'setOcclusion'
> &
  Partial<Pick<ChunkMeshes, 'setWeathering'>>;
type WeatheringNumberField = keyof typeof WEATHERING_RANGES;
type WeatheringColorField = 'tintColor' | 'streakColor' | 'mossColor';

export class LookControls {
  private mode: number;
  private readonly renderer: LookRenderer | undefined;
  private readonly meshes: LookMeshes | undefined;
  private readonly mood: MoodControls | undefined;
  private readonly weather: Weather;
  private readonly shadows: ShadowControls | undefined;
  private readonly flashlight: { strength: number };
  private moodValue: MoodState = { ...DEFAULT_MOOD };
  private shadowValue: ShadowState = { ...DEFAULT_SHADOWS };
  private exposureValue = DEFAULT_LOOK.exposure;
  private linearColorsValue = DEFAULT_LOOK.srgb;
  private patternsValue = DEFAULT_LOOK.patterns;
  private occlusionValue = DEFAULT_LOOK.vao;
  private crackCheckValue = false;
  private weatheringValue: WeatheringUrlState | undefined;
  private readonly weatheringProfiles: ReadonlyMap<string, WeatheringDef>;
  private readonly weatheringSplit: number | undefined;

  /** Takes the renderer as it is: play has applied the default look, and the tone mode follows it. */
  constructor(
    renderer: LookRenderer | undefined,
    meshes: LookMeshes | undefined,
    mood: MoodControls | undefined,
    environment: {
      weather: Weather;
      shadows?: ShadowControls;
      flashlight: { strength: number };
      weathering?: {
        state: WeatheringUrlState;
        profiles: ReadonlyMap<string, WeatheringDef>;
        split?: number;
      };
    },
  ) {
    this.renderer = renderer;
    this.meshes = meshes;
    this.mood = mood;
    this.weather = environment.weather;
    this.shadows = environment.shadows;
    this.flashlight = environment.flashlight;
    this.weatheringValue = environment.weathering?.state;
    this.weatheringProfiles = environment.weathering?.profiles ?? new Map();
    this.weatheringSplit = environment.weathering?.split;
    this.mode = Math.max(
      0,
      renderer
        ? TONE_MODES.findIndex((candidate) => candidate.mapping === renderer.toneMapping)
        : TONE_MODES.findIndex((candidate) => candidate.key === DEFAULT_LOOK.tone),
    );
    this.exposureValue = renderer?.toneMappingExposure ?? DEFAULT_LOOK.exposure;
    this.linearColorsValue = meshes?.linearColorsOn ?? DEFAULT_LOOK.srgb;
    this.patternsValue = meshes?.patternsOn ?? DEFAULT_LOOK.patterns;
    this.occlusionValue = meshes?.occlusionOn ?? DEFAULT_LOOK.vao;
    if (mood) {
      this.moodValue = {
        post: mood.post,
        bloom: mood.bloom,
        film: mood.film,
        grade: mood.grade,
        bloomClip: mood.bloomClip,
      };
    }
    this.shadowValue = { ...(environment.shadows?.settings ?? DEFAULT_SHADOWS) };
  }

  /** The mood pass as it is now, in the URL's terms. */
  get moodState(): MoodState {
    if (!this.mood) {
      return { ...this.moodValue };
    }
    const { post, bloom, film, grade, bloomClip } = this.mood;
    return { post, bloom, film, grade, bloomClip };
  }

  /** The clip bloom works from now: the override, else the active tone mapper's derived value. */
  get bloomClip(): number {
    return this.moodState.bloomClip ?? this.ownBloomClip();
  }

  /** The active tone mapper's own clip; under `auto` it moves with the time of day. */
  private ownBloomClip(): number {
    return bloomClipFor(this.toneKey, autoToneUniforms.autoToneWeight.value);
  }

  /** True while the clip follows the tone mapper (no override). */
  get bloomClipIsDefault(): boolean {
    return this.moodState.bloomClip === null;
  }

  /** Steps the bloom clip by `steps` of 0.5, clamped. Landing on the tone mapper's own value goes back to following it. */
  stepBloomClip(steps: number): void {
    const next = clampBloomClip(this.bloomClip + steps * BLOOM_CLIP_STEP);
    // Under `auto` the own clip is not on a tenth, so compare at the override's precision.
    const value = next === clampBloomClip(this.ownBloomClip()) ? null : next;
    this.moodValue.bloomClip = value;
    this.mood?.setBloomClip(value);
  }

  /** The master: off, the frame is drawn straight to the screen with no bloom, grade, film or height fog. */
  togglePost(): void {
    this.moodValue.post = !this.moodState.post;
    this.mood?.setPost(this.moodValue.post);
  }

  toggleBloom(): void {
    this.moodValue.bloom = !this.moodState.bloom;
    this.mood?.setBloom(this.moodValue.bloom);
  }

  toggleFilm(): void {
    this.moodValue.film = !this.moodState.film;
    this.mood?.setFilm(this.moodValue.film);
  }

  /** Steps the grade strength by `steps` tenths, clamped to [0, 1]. */
  stepGrade(steps: number): void {
    this.moodValue.grade = clampGrade(this.moodState.grade + steps * GRADE_STEP);
    this.mood?.setGrade(this.moodValue.grade);
  }

  /** The shadow settings as they are now, in the URL's terms. */
  get shadowState(): ShadowState {
    return this.shadows?.settings ?? { ...this.shadowValue };
  }

  /** Switching either light's shadows rebuilds the shader programs once (they differ by whether a light casts), so expect a hitch. */
  toggleSunShadows(): void {
    this.shadowValue = { ...this.shadowState, sun: !this.shadowState.sun };
    this.shadows?.setSun(this.shadowValue.sun);
  }

  toggleTorchShadows(): void {
    this.shadowValue = { ...this.shadowState, torch: !this.shadowState.torch };
    this.shadows?.setTorch(this.shadowValue.torch);
  }

  /** Steps the sun's shadow distance through the allowed list, wrapping. */
  stepShadowDistance(): void {
    if (this.shadows) {
      this.shadows.stepDistance();
    } else {
      this.shadowValue = { ...this.shadowValue, distance: nextShadowDistance(this.shadowValue.distance) };
    }
  }

  /** Multiplier on the flashlight's intensity (1 is the tuned beam). */
  get torch(): number {
    return this.flashlight.strength;
  }

  /** Steps the flashlight strength up (or down) by `TORCH_STEP` per step, clamped. */
  stepTorch(steps: number): void {
    this.flashlight.strength = clampTorch(this.torch * TORCH_STEP ** steps);
  }

  get fogginess(): number {
    return this.weather.fogginess;
  }

  /** Steps the fogginess by `steps` tenths, clamped to [0, 1]. A weather system would set this itself. */
  stepFogginess(steps: number): void {
    this.weather.fogginess = clampFogginess(this.weather.fogginess + steps * FOGGINESS_STEP);
  }

  /** Site profile values as currently edited; the URL writer omits values equal to the selected profile. */
  get weatheringState(): WeatheringUrlState | undefined {
    return this.weatheringValue
      ? { ...this.weatheringValue, settings: { ...this.weatheringValue.settings } }
      : undefined;
  }

  get weatheringProfileOptions(): readonly WeatheringDef[] {
    return [...this.weatheringProfiles.values()];
  }

  selectWeatheringProfile(profileId: string): void {
    const profile = this.weatheringProfiles.get(profileId);
    if (!(profile && this.weatheringValue)) {
      return;
    }
    this.weatheringValue = { ...this.weatheringValue, profileId: profile.id, settings: { ...profile } };
    this.meshes?.setWeathering?.(this.weatheringValue.settings, this.weatheringSplit);
  }

  setWeatheringNumber(field: WeatheringNumberField, value: number): void {
    const state = this.weatheringValue;
    if (!(state && Number.isFinite(value))) {
      return;
    }
    const { min, max } = WEATHERING_RANGES[field];
    state.settings[field] = Math.max(min, Math.min(max, value));
    this.meshes?.setWeathering?.(state.settings, this.weatheringSplit);
  }

  setWeatheringColor(field: WeatheringColorField, value: string): void {
    const state = this.weatheringValue;
    if (!(state && isWeatheringColor(value))) {
      return;
    }
    state.settings[field] = value;
    this.meshes?.setWeathering?.(state.settings, this.weatheringSplit);
  }

  get toneMappingName(): string {
    const { key, name } = TONE_MODES[this.mode]!;
    return key === AUTO_TONE ? `${name} (${autoToneUniforms.autoToneWeight.value.toFixed(2)})` : name;
  }

  get exposure(): number {
    return this.renderer?.toneMappingExposure ?? this.exposureValue;
  }

  get linearColors(): boolean {
    return this.meshes?.linearColorsOn ?? this.linearColorsValue;
  }

  get patterns(): boolean {
    return this.meshes?.patternsOn ?? this.patternsValue;
  }

  /** Wide ambient occlusion on ambient light. */
  get occlusion(): boolean {
    return this.meshes?.occlusionOn ?? this.occlusionValue;
  }

  cycleToneMapping(): void {
    this.mode = (this.mode + 1) % TONE_MODES.length;
    if (this.renderer) {
      this.renderer.toneMapping = TONE_MODES[this.mode]!.mapping;
    }
  }

  /** The `?tone=` URL value of the current mode. */
  get toneKey(): string {
    return TONE_MODES[this.mode]!.key;
  }

  /** Steps exposure by `steps` tenths, clamped. */
  stepExposure(steps: number): void {
    this.exposureValue = clampExposure(this.exposure + steps * EXPOSURE_STEP);
    if (this.renderer) {
      this.renderer.toneMappingExposure = this.exposureValue;
    }
  }

  /** Applies a state read from the URL; an unknown tone key leaves the mode alone. */
  restore(
    state: LookState &
      MoodState & {
        fogginess: number;
        torch: number;
        shadows: ShadowState;
        crackCheck: boolean;
        hotCheck: boolean;
      },
  ): void {
    if (this.renderer && this.meshes) {
      applyLook(this.renderer, this.meshes, state);
    }
    this.exposureValue = state.exposure;
    this.linearColorsValue = state.srgb;
    this.patternsValue = state.patterns;
    this.occlusionValue = state.vao;
    this.flashlight.strength = clampTorch(state.torch);
    const mode = TONE_MODES.findIndex((candidate) => candidate.key === state.tone);
    if (mode >= 0) {
      this.mode = mode;
    }
    this.weather.fogginess = clampFogginess(state.fogginess);
    this.moodValue = {
      post: state.post,
      bloom: state.bloom,
      film: state.film,
      grade: state.grade,
      bloomClip: state.bloomClip,
    };
    this.mood?.restore({
      post: state.post,
      bloom: state.bloom,
      film: state.film,
      grade: state.grade,
      bloomClip: state.bloomClip,
    });
    this.shadowValue = { ...state.shadows };
    this.shadows?.restore(state.shadows);
    this.crackCheckValue = state.crackCheck;
    this.mood?.setCrackCheck(state.crackCheck);
    setHotCheck(state.hotCheck);
  }

  /** Background drawn magenta: magenta pixels on the world are holes that show it. */
  get crackCheck(): boolean {
    return this.mood?.crackCheck ?? this.crackCheckValue;
  }

  toggleCrackCheck(): void {
    this.crackCheckValue = !this.crackCheck;
    this.mood?.setCrackCheck(this.crackCheckValue);
  }

  /** Lit fragments that are NaN, negative or over-bright drawn cyan. */
  get hotCheck(): boolean {
    return hotCheckOn();
  }

  toggleHotCheck(): void {
    setHotCheck(!hotCheckOn());
  }

  toggleLinearColors(): void {
    this.linearColorsValue = !this.linearColors;
    this.meshes?.setLinearColors(this.linearColorsValue);
  }

  togglePatterns(): void {
    this.patternsValue = !this.patterns;
    this.meshes?.setPatterns(this.patternsValue);
  }

  /** A uniform, so no remesh and no recompile. */
  toggleOcclusion(): void {
    this.occlusionValue = !this.occlusion;
    this.meshes?.setOcclusion(this.occlusionValue);
  }
}
