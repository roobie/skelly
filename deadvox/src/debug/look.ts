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

const TONE_MODES: readonly { readonly name: string; readonly mapping: ToneMapping }[] = [
  { name: 'None', mapping: NoToneMapping },
  { name: 'AgX', mapping: AgXToneMapping },
  { name: 'ACES Filmic', mapping: ACESFilmicToneMapping },
  { name: 'Neutral', mapping: NeutralToneMapping },
];

const EXPOSURE_STEP = 0.1;
const MIN_EXPOSURE = 0.2;
const MAX_EXPOSURE = 3.0;

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

  /** Steps exposure by `steps` tenths, clamped. Rounded so repeated steps don't accumulate float error. */
  stepExposure(steps: number): void {
    const next = Math.round((this.exposure + steps * EXPOSURE_STEP) * 10) / 10;
    this.renderer.toneMappingExposure = Math.min(MAX_EXPOSURE, Math.max(MIN_EXPOSURE, next));
  }

  toggleLinearColors(): void {
    this.meshes.setLinearColors(!this.meshes.linearColorsOn);
  }

  private apply(): void {
    this.renderer.toneMapping = TONE_MODES[this.mode]!.mapping;
  }
}
