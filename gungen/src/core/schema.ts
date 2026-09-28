// Domain-agnostic data model: parts, ports, keep-out volumes, assemblies.
// Everything domain-specific (which parts and mount types exist) is data
// supplied through a Domain.

import type { Issue } from './issue.ts';
import type { Vec3 } from './math.ts';
import type { Resolved } from './resolve.ts';

/** Axis-aligned box in its part's local frame. */
export interface Box {
  readonly center: Vec3;
  readonly half: Vec3;
}

export type Gender = 'male' | 'female';

/**
 * A connection point. Its frame is: origin `pos`, local X = `normal`
 * (pointing out of the part), local Y = `up` (the roll reference, which must
 * be perpendicular to `normal`), local Z = normal × up.
 */
export interface PortDef {
  readonly id: string;
  readonly mount: string;
  readonly gender: Gender;
  /** Size class. When both sides of a connection have one, they must match. */
  readonly size?: string;
  readonly pos: Vec3;
  readonly normal: Vec3;
  readonly up: Vec3;
  readonly required?: boolean;
  /** Magazine seating contract: inserted into a well or face-mated to a flat underside. */
  readonly seat?: 'well' | 'face';
  /** One-to-many ports (e.g. a rail). Slot k sits at pos + up * k * pitch. */
  readonly slots?: { readonly count: number; readonly pitch: number };
}

export interface BoxSolid {
  readonly id: string;
  readonly kind: 'box';
  readonly box: Box;
}

export type Vec2 = readonly [number, number];

export interface ExtrudedPolygonSolid {
  readonly id: string;
  readonly kind: 'extruded-polygon';
  /** Convex profile in local X–Y coordinates, listed counter-clockwise. */
  readonly profile: readonly Vec2[];
  /** Local Z bounds of the extrusion. */
  readonly z: readonly [number, number];
}

export type Solid = BoxSolid | ExtrudedPolygonSolid;

/** Space that must stay empty (PROJECT.md §3). A convex extrusion may refine its broad-phase box. */
export interface KeepOut {
  readonly id: string;
  readonly kind: string;
  /** Conservative local bounds; also retained for callers that inspect simple keep-outs. */
  readonly box: Box;
  /** Optional exact convex XY keep-out shape, extruded through local Z. */
  readonly profile?: readonly Vec2[];
  readonly z?: readonly [number, number];
  /** The part attached at this port of the owner may occupy the volume. */
  readonly allowPort?: string;
}

/** A named axis on a part, such as a bore or a sight line. */
export interface Axis {
  readonly kind: string;
  readonly origin: Vec3;
  readonly dir: Vec3;
}

export interface PartDef {
  readonly family: string;
  readonly ports: readonly PortDef[];
  readonly solids: readonly Solid[];
  /** Optional higher-resolution scene tessellation; never used for collision checks. */
  readonly displaySolids?: readonly Solid[];
  readonly keepOuts: readonly KeepOut[];
  readonly axes: readonly Axis[];
  /** Free-form labels that domain rules can look for. */
  readonly tags?: readonly string[];
}

/** Where a param can read its value from: the part on one of our ports. */
export interface ParamSource {
  /** Our port; the part connected there is the neighbour. */
  readonly port: string;
  /** The neighbour's param to copy. */
  readonly param: string;
}

export interface ParamSpec {
  readonly values: readonly string[];
  readonly default: string;
  /**
   * When the assembly doesn't set this param, take it from a neighbour: the
   * first source whose port is connected wins. Otherwise use the default.
   */
  readonly from?: readonly ParamSource[];
}

/** A parametric family of parts (PROJECT.md §7). */
export interface PartFamily {
  readonly name: string;
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly build: (params: Readonly<Record<string, string>>) => PartDef;
}

export interface AxisRule {
  readonly kind: string;
  /** collinear: on the main axis. parallel: same direction as the main axis. */
  readonly mode: 'collinear' | 'parallel';
}

/** A feasibility check over a resolved assembly (PROJECT.md §1). */
export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly check: (r: Resolved) => Issue[];
}

export interface Domain {
  readonly name: string;
  readonly families: Readonly<Record<string, PartFamily>>;
  readonly axisRules: readonly AxisRule[];
  /** Domain-specific rules, run after the core rules. */
  readonly rules?: readonly Rule[];
}

// ---- Assembly file format (JSON) ----

export interface PrefabReference {
  readonly id: string;
  /** Positive integer catalogue revision. */
  readonly version: number;
}

export interface PartInstance {
  readonly family: string;
  readonly params?: Readonly<Record<string, string>>;
  /** Present on curated designs; legacy assemblies need no prefab reference. */
  readonly prefab?: PrefabReference;
}

export interface Connection {
  /** "partId.portId" */
  readonly from: string;
  /** "partId.portId" */
  readonly to: string;
  /** Slot on the `from` port, for slotted ports. */
  readonly slot?: number;
  /** Roll about the `from` port's normal, in degrees; a multiple of 90. */
  readonly roll?: number;
}

export interface Assembly {
  readonly name: string;
  readonly description?: string;
  readonly root: string;
  readonly parts: Readonly<Record<string, PartInstance>>;
  readonly connections: readonly Connection[];
  /** For fixtures: the rule ids this assembly is expected to fail. */
  readonly expect?: readonly string[];
}
