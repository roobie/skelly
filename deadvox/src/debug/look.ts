// Live look controls for the deadvox/look-experiments workstream: they exist so
// different looks (tone mapping, exposure, block colour space) can be compared by eye.

import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import type { ChunkMeshes } from '../render/chunks.ts';

/** `key` is the `?tone=` URL value (see lookUrl.ts); the first mode is the default. */
export const TONE_MODES: readonly { readonly key: string; readonly name: string; readonly mapping: ToneMapping }[] = [
  { key: 'none', name: 'None', mapping: NoToneMapping },
  { key: 'agx', name: 'AgX', mapping: AgXToneMapping },
  { key: 'aces', name: 'ACES Filmic', mapping: ACESFilmicToneMapping },
  { key: 'neutral', name: 'Neutral', mapping: NeutralToneMapping },
];

const EXPOSURE_STEP = 0.1;
const MIN_EXPOSURE = 0.2;
const MAX_EXPOSURE = 3.0;
/** three's own default, which is what the renderer starts at. */
export const DEFAULT_EXPOSURE = 1;

/** Clamped to the allowed range and rounded to a tenth, so repeated steps don't accumulate float error. */
export const clampExposure = (value: number): number =>
  Math.min(MAX_EXPOSURE, Math.max(MIN_EXPOSURE, Math.round(value * 10) / 10));

export class LookControls {
  private mode = 0;
  private readonly renderer: Pick<WebGLRenderer, 'toneMapping' | 'toneMappingExposure'>;
  private readonly meshes: Pick<ChunkMeshes, 'linearColorsOn' | 'setLinearColors'>;

  constructor(
    renderer: Pick<WebGLRenderer, 'toneMapping' | 'toneMappingExposure'>,
    meshes: Pick<ChunkMeshes, 'linearColorsOn' | 'setLinearColors'>,
  ) {
    this.renderer = renderer;
    this.meshes = meshes;
    this.apply();
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

  cycleToneMapping(): void {
    this.mode = (this.mode + 1) % TONE_MODES.length;
    this.apply();
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
  restore(state: { tone: string; exposure: number; srgb: boolean }): void {
    const mode = TONE_MODES.findIndex((candidate) => candidate.key === state.tone);
    if (mode >= 0) {
      this.mode = mode;
      this.apply();
    }
    this.renderer.toneMappingExposure = clampExposure(state.exposure);
    this.meshes.setLinearColors(state.srgb);
  }

  toggleLinearColors(): void {
    this.meshes.setLinearColors(!this.meshes.linearColorsOn);
  }

  private apply(): void {
    this.renderer.toneMapping = TONE_MODES[this.mode]!.mapping;
  }
}
