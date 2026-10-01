// Live look controls for the deadvox/look-experiments workstream: they exist so
// different looks (tone mapping, exposure, block colour space, mood pass, fog) can be compared by
// eye against the game's default look (DEFAULT_LOOK in core/mood.ts), which play has already applied.

import type { WebGLRenderer } from 'three';
import { clampExposure, clampGrade, type LookState, type MoodState } from '../core/mood.ts';
import { clampFogginess, type Weather } from '../core/weather.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import { applyLook, TONE_MODES } from '../render/look.ts';
import type { Mood } from '../render/mood.ts';

const EXPOSURE_STEP = 0.1;
const GRADE_STEP = 0.1;
const FOGGINESS_STEP = 0.1;

type MoodControls = Pick<
  Mood,
  'post' | 'bloom' | 'film' | 'grade' | 'restore' | 'setPost' | 'setBloom' | 'setFilm' | 'setGrade'
>;

type LookRenderer = Pick<WebGLRenderer, 'toneMapping' | 'toneMappingExposure'>;
type LookMeshes = Pick<ChunkMeshes, 'linearColorsOn' | 'setLinearColors' | 'patternsOn' | 'setPatterns'>;

export class LookControls {
  private mode: number;
  private readonly renderer: LookRenderer;
  private readonly meshes: LookMeshes;
  private readonly mood: MoodControls;
  private readonly weather: Weather;

  /** Takes the renderer as it is: play has applied the default look, and the tone mode follows it. */
  constructor(renderer: LookRenderer, meshes: LookMeshes, mood: MoodControls, weather: Weather) {
    this.renderer = renderer;
    this.meshes = meshes;
    this.mood = mood;
    this.weather = weather;
    this.mode = Math.max(
      0,
      TONE_MODES.findIndex((candidate) => candidate.mapping === renderer.toneMapping),
    );
  }

  /** The mood pass as it is now, in the URL's terms. */
  get moodState(): MoodState {
    const { post, bloom, film, grade } = this.mood;
    return { post, bloom, film, grade };
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
  restore(state: LookState & MoodState & { fogginess: number }): void {
    applyLook(this.renderer, this.meshes, state);
    const mode = TONE_MODES.findIndex((candidate) => candidate.key === state.tone);
    if (mode >= 0) {
      this.mode = mode;
    }
    this.weather.fogginess = clampFogginess(state.fogginess);
    this.mood.restore({ post: state.post, bloom: state.bloom, film: state.film, grade: state.grade });
  }

  toggleLinearColors(): void {
    this.meshes.setLinearColors(!this.meshes.linearColorsOn);
  }

  togglePatterns(): void {
    this.meshes.setPatterns(!this.meshes.patternsOn);
  }
}
