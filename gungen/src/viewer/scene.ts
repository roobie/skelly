import type { Report } from '@skelly/engine/assembly/validate.ts';
import { MAIN_AXIS } from '@skelly/engine/foundation/conventions.ts';
import type { Issue } from '@skelly/engine/foundation/issue.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { Layers as EngineLayers } from '@skelly/tool-ui/scene';
import { buildLayers as buildEngineLayers, disposeGroup as disposeEngineGroup } from '@skelly/tool-ui/scene';
import { threeRuntime } from '@skelly/tool-ui/three-runtime';
import { GUN_PALETTE } from '../gun/palette.ts';

export type Layers = EngineLayers;
export const disposeGroup = disposeEngineGroup;

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
    threeRuntime,
    MAIN_AXIS,
    colorMode,
    appearanceContext,
    revolveFacets,
    partOffsets,
  );
}
