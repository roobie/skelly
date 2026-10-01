// Live look controls for the deadvox/look-experiments workstream: they exist so
// different looks (tone mapping, exposure, block colour space, mood pass, fog) can be compared by
// eye against the game's default look (DEFAULT_LOOK in core/mood.ts), which play has already applied.

import type { WebGLRenderer } from 'three';
import {
  bloomClipFor,
  clampBloomClip,
  clampExposure,
  clampGrade,
  clampTorch,
  type LookState,
  type MoodState,
  type ShadowState,
  TORCH_STEP,
} from '../core/mood.ts';
import { clampFogginess, type Weather } from '../core/weather.ts';
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
>;

export class LookControls {
  private mode: number;
  private readonly renderer: LookRenderer;
  private readonly meshes: LookMeshes;
  private readonly mood: MoodControls;
  private readonly weather: Weather;
  private readonly shadows: ShadowControls;
  private readonly flashlight: { strength: number };

  /** Takes the renderer as it is: play has applied the default look, and the tone mode follows it. */
  constructor(
    renderer: LookRenderer,
    meshes: LookMeshes,
    mood: MoodControls,
    environment: { weather: Weather; shadows: ShadowControls; flashlight: { strength: number } },
  ) {
    this.renderer = renderer;
    this.meshes = meshes;
    this.mood = mood;
    this.weather = environment.weather;
    this.shadows = environment.shadows;
    this.flashlight = environment.flashlight;
    this.mode = Math.max(
      0,
      TONE_MODES.findIndex((candidate) => candidate.mapping === renderer.toneMapping),
    );
  }

  /** The mood pass as it is now, in the URL's terms. */
  get moodState(): MoodState {
    const { post, bloom, film, grade, bloomClip } = this.mood;
    return { post, bloom, film, grade, bloomClip };
  }

  /** The clip bloom works from now: the override, else the active tone mapper's derived value. */
  get bloomClip(): number {
    return this.mood.bloomClip ?? bloomClipFor(this.toneKey);
  }

  /** True while the clip follows the tone mapper (no override). */
  get bloomClipIsDefault(): boolean {
    return this.mood.bloomClip === null;
  }

  /** Steps the bloom clip by `steps` of 0.5, clamped. Landing on the tone mapper's own value goes back to following it. */
  stepBloomClip(steps: number): void {
    const next = clampBloomClip(this.bloomClip + steps * BLOOM_CLIP_STEP);
    this.mood.setBloomClip(next === bloomClipFor(this.toneKey) ? null : next);
  }

  /** The master: off, the frame is drawn straight to the screen with no bloom, grade, film or height fog. */
  togglePost(): void {
    this.mood.setPost(!this.mood.post);
  }

  toggleBloom(): void {
    this.mood.setBloom(!this.mood.bloom);
  }

  toggleFilm(): void {
    this.mood.setFilm(!this.mood.film);
  }

  /** Steps the grade strength by `steps` tenths, clamped to [0, 1]. */
  stepGrade(steps: number): void {
    this.mood.setGrade(clampGrade(this.mood.grade + steps * GRADE_STEP));
  }

  /** The shadow settings as they are now, in the URL's terms. */
  get shadowState(): ShadowState {
    return this.shadows.settings;
  }

  /** Switching either light's shadows rebuilds the shader programs once (they differ by whether a light casts), so expect a hitch. */
  toggleSunShadows(): void {
    this.shadows.setSun(!this.shadows.settings.sun);
  }

  toggleTorchShadows(): void {
    this.shadows.setTorch(!this.shadows.settings.torch);
  }

  /** Steps the sun's shadow distance through the allowed list, wrapping. */
  stepShadowDistance(): void {
    this.shadows.stepDistance();
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

  get toneMappingName(): string {
    return TONE_MODES[this.mode]!.name;
  }

  get exposure(): number {
    return this.renderer.toneMappingExposure;
  }

  get linearColors(): boolean {
    return this.meshes.linearColorsOn;
  }

  get patterns(): boolean {
    return this.meshes.patternsOn;
  }

  /** Wide ambient occlusion on ambient light. */
  get occlusion(): boolean {
    return this.meshes.occlusionOn;
  }

  cycleToneMapping(): void {
    this.mode = (this.mode + 1) % TONE_MODES.length;
    this.renderer.toneMapping = TONE_MODES[this.mode]!.mapping;
  }

  /** The `?tone=` URL value of the current mode. */
  get toneKey(): string {
    return TONE_MODES[this.mode]!.key;
  }

  /** Steps exposure by `steps` tenths, clamped. */
  stepExposure(steps: number): void {
    this.renderer.toneMappingExposure = clampExposure(this.exposure + steps * EXPOSURE_STEP);
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
    applyLook(this.renderer, this.meshes, state);
    this.flashlight.strength = clampTorch(state.torch);
    const mode = TONE_MODES.findIndex((candidate) => candidate.key === state.tone);
    if (mode >= 0) {
      this.mode = mode;
    }
    this.weather.fogginess = clampFogginess(state.fogginess);
    this.mood.restore({
      post: state.post,
      bloom: state.bloom,
      film: state.film,
      grade: state.grade,
      bloomClip: state.bloomClip,
    });
    this.shadows.restore(state.shadows);
    this.mood.setCrackCheck(state.crackCheck);
    setHotCheck(state.hotCheck);
  }

  /** Background drawn magenta: magenta pixels on the world are holes that show it. */
  get crackCheck(): boolean {
    return this.mood.crackCheck;
  }

  toggleCrackCheck(): void {
    this.mood.setCrackCheck(!this.mood.crackCheck);
  }

  /** Lit fragments that are NaN, negative or over-bright drawn cyan. */
  get hotCheck(): boolean {
    return hotCheckOn();
  }

  toggleHotCheck(): void {
    setHotCheck(!hotCheckOn());
  }

  toggleLinearColors(): void {
    this.meshes.setLinearColors(!this.meshes.linearColorsOn);
  }

  togglePatterns(): void {
    this.meshes.setPatterns(!this.meshes.patternsOn);
  }

  /** A uniform, so no remesh and no recompile. */
  toggleOcclusion(): void {
    this.meshes.setOcclusion(!this.meshes.occlusionOn);
  }
}
