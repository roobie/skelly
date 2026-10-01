// Applies the look (core/mood.ts `LookState`) to the renderer and the block materials. Play does it
// once at start-up with DEFAULT_LOOK; the debug controls change the same settings afterwards.

import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import { clampExposure, type LookState } from '../core/mood.ts';
import type { ChunkMeshes } from './chunks.ts';

/** `key` is the `?tone=` URL value (see debug/lookUrl.ts) and `LookState.tone`. */
export const TONE_MODES: readonly { readonly key: string; readonly name: string; readonly mapping: ToneMapping }[] = [
  { key: 'none', name: 'None', mapping: NoToneMapping },
  { key: 'agx', name: 'AgX', mapping: AgXToneMapping },
  { key: 'aces', name: 'ACES Filmic', mapping: ACESFilmicToneMapping },
  { key: 'neutral', name: 'Neutral', mapping: NeutralToneMapping },
];

export const applyLook = (
  renderer: Pick<WebGLRenderer, 'toneMapping' | 'toneMappingExposure'>,
  meshes: Pick<ChunkMeshes, 'setLinearColors' | 'setPatterns'>,
  look: LookState,
): void => {
  const mode = TONE_MODES.find((candidate) => candidate.key === look.tone);
  if (mode) {
    renderer.toneMapping = mode.mapping;
  }
  renderer.toneMappingExposure = clampExposure(look.exposure);
  meshes.setLinearColors(look.srgb);
  meshes.setPatterns(look.patterns);
};
