// biome-ignore-all lint/style/useNamingConvention: The injected renderer mirrors Three.js constructor names.
import { MAIN_AXIS } from '@skelly/engine/core/conventions.ts';
import type { Issue } from '@skelly/engine/core/issue.ts';
import type { Vec3 } from '@skelly/engine/core/math.ts';
import type { Report } from '@skelly/engine/core/validate.ts';
import type { Layers as EngineLayers } from '@skelly/engine/viewer/scene';
import { buildLayers as buildEngineLayers, disposeGroup as disposeEngineGroup } from '@skelly/engine/viewer/scene';
import {
  ArrowHelper,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GUN_PALETTE } from '../gun/palette.ts';

export type Layers = EngineLayers;
export const disposeGroup = disposeEngineGroup;

const THREE_RUNTIME = {
  ArrowHelper,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
};

// Preserve the viewer's existing call shape while supplying the Gungen renderer and palette.
// biome-ignore lint/complexity/useMaxParams: Mirrors the existing scene API; only renderer dependencies are injected.
export function buildLayers(
  report: Report,
  focus: readonly Issue[],
  colorMode: 'finish' | 'role' = 'finish',
  appearanceContext: Parameters<typeof buildEngineLayers>[6] = {},
  revolveFacets?: number,
  partOffsets: ReadonlyMap<string, Vec3> = new Map(),
): Layers {
  return buildEngineLayers(
    report,
    focus,
    GUN_PALETTE,
    THREE_RUNTIME,
    MAIN_AXIS,
    colorMode,
    appearanceContext,
    revolveFacets,
    partOffsets,
  );
}
