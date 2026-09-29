// Generic anchor resolution: family-local frames -> assembly space (PROJECT.md, "Hold anchors").
// Core knows nothing about which anchor names exist; the domain supplies the declarations.

import type { AnchorFrame, NamedAnchors, PartAnchorDeclarations, ResolveAnchors } from './design.ts';
import type { Transform } from './math.ts';
import { applyDir, applyPoint } from './math.ts';

const toAssembly = (t: Transform, f: AnchorFrame): AnchorFrame => ({
  position: applyPoint(t, f.position),
  forward: applyDir(t, f.forward),
  up: applyDir(t, f.up),
});

/**
 * Transforms each placed part's declared anchors into assembly space. Declarations are keyed by the
 * assembly's `PartInstance.family` (the domain registry key). Parts that are unplaced, have no built
 * definition, or have no declaration are omitted from the result.
 */
export const resolveAnchors: ResolveAnchors = <Name extends string>(
  resolved: Parameters<ResolveAnchors>[0],
  declarations: PartAnchorDeclarations<Name>,
) => {
  const out: Record<string, NamedAnchors<Name>> = {};
  for (const [id, transform] of resolved.placed) {
    const def = resolved.defs.get(id);
    const params = resolved.params.get(id);
    const declare = declarations[resolved.assembly.parts[id]?.family ?? ''];
    if (!(def && params && declare)) {
      continue;
    }
    const values = Object.fromEntries(Object.entries(params).map(([name, p]) => [name, p.value]));
    const frames: Partial<Record<Name, AnchorFrame>> = {};
    for (const [name, frame] of Object.entries(declare(values, def)) as [Name, AnchorFrame | undefined][]) {
      if (frame) {
        frames[name] = toAssembly(transform, frame);
      }
    }
    out[id] = frames;
  }
  return out;
};
