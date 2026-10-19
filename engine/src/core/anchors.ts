// Domain-owned declarations keep the shared core independent of consumer-specific anchor vocabularies.

import type { Transform, Vec3 } from './math.ts';
import { applyDir, applyPoint } from './math.ts';
import type { PartDef, Resolved } from './schema.ts';

/** Generic right-handed frame in its owner's local or resolved assembly space, in domain units. */
export interface AnchorFrame {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly up: Vec3;
}

/** Named local anchors declared by a part family; names are supplied by its domain. */
export type NamedAnchors<Name extends string = string> = Readonly<Partial<Record<Name, AnchorFrame>>>;

/** One family-local declaration, evaluated against its selected params and built part definition. */
export type PartAnchorDeclaration<Name extends string = string> = (
  params: Readonly<Record<string, string>>,
  part: PartDef,
) => NamedAnchors<Name>;

/** Family name -> local anchor declaration. This registry is supplied by a domain, not stored in core. */
export type PartAnchorDeclarations<Name extends string = string> = Readonly<
  Record<string, PartAnchorDeclaration<Name>>
>;

/** Part id -> named frames transformed into resolved assembly coordinates, in domain units. */
export type ResolvedAnchors<Name extends string = string> = Readonly<Record<string, NamedAnchors<Name>>>;

/** Contract for the generic core transformation from family-local to assembly-space anchors. */
export type ResolveAnchors = <Name extends string>(
  resolved: Resolved,
  declarations: PartAnchorDeclarations<Name>,
) => ResolvedAnchors<Name>;

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
