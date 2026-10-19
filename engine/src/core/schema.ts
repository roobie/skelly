// Domain-agnostic data model: parts, ports, keep-out volumes, assemblies.
// Everything domain-specific (which parts and mount types exist) is data
// supplied through a Domain.

import type { Issue } from './issue.ts';
import type { ExtrusionAxis, Transform, Vec3 } from './math.ts';
import type { Box, DomainUnits, Solid, Vec2 } from './solid.ts';

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
  /**
   * What the interface is built for within its mount type, such as a thread cut. Both sides of a connection declare
   * the same standard or neither does, so fit is a property of both parts rather than of whichever side declares it.
   */
  readonly standard?: string;
  readonly pos: Vec3;
  readonly normal: Vec3;
  readonly up: Vec3;
  readonly required?: boolean;
  /** One-to-many ports (e.g. a rail). Slot k sits at pos + up * k * pitch. */
  readonly slots?: { readonly count: number; readonly pitch: number };
}

/** Exact convex profiles tighten conservative broad-phase bounds for keep-outs. */
export interface KeepOut {
  readonly id: string;
  readonly kind: string;
  /** Conservative local bounds; also retained for callers that inspect simple keep-outs. */
  readonly box: Box;
  /** Optional exact convex keep-out profile, using the same axis plane ordering as ExtrudedPolygonSolid. */
  readonly profile?: readonly Vec2[];
  /** Extrusion direction; omission keeps existing keep-outs on local Z. */
  readonly axis?: ExtrusionAxis;
  /** Bounds along `axis` (legacy name `z` retained for existing keep-outs). */
  readonly z?: readonly [number, number];
  /** The part attached at this port of the owner may occupy the volume. */
  readonly allowPort?: string;
  /** Parts from these families may occupy the volume (e.g. an attached part inside a designated clearance volume). */
  readonly allowFamilies?: readonly string[];
}

/** A named axis on a part for domain-defined rules. */
interface Axis {
  readonly kind: string;
  readonly origin: Vec3;
  readonly dir: Vec3;
  readonly eyeReliefU?: number;
}

export interface PartTurn {
  readonly pivot: Vec3;
  readonly axis: Vec3;
  readonly angleRadians: number;
}

export interface PartMotion {
  readonly kind: 'linear';
  /** Rotation about a local pivot before translation; translation reverses before the turn returns. */
  readonly turn?: PartTurn;
  /** Local unit direction of travel from the start point to the end point. */
  readonly axis: Vec3;
  readonly start: Vec3;
  readonly end: Vec3;
  /** Internal source resolved from a connected part's named keep-out. */
  readonly sourceKeepOut?: { readonly port: string; readonly id: string };
}

export interface PartDef {
  readonly family: string;
  /** Optional finish override for attachments or aftermarket parts. */
  readonly material?: string;
  /** Optional material slot override; otherwise selected from the part role. */
  readonly slot?: string;
  readonly ports: readonly PortDef[];
  readonly solids: readonly Solid[];
  /** Optional higher-resolution scene tessellation; never used for collision checks. */
  readonly displaySolids?: readonly Solid[];
  readonly keepOuts: readonly KeepOut[];
  readonly axes: readonly Axis[];
  /** Optional animation path, serialized to this part's glTF node extras. */
  readonly motion?: PartMotion;
  /** Free-form labels that domain rules can look for. */
  readonly tags?: readonly string[];
}

/** Where a param can read its value from: the part on one of our ports. */
interface ParamSource {
  /** Our port; the part connected there is the neighbour. */
  readonly port: string;
  /** The neighbour's param to copy. */
  readonly param: string;
}

export interface ParamSpec {
  readonly values: readonly string[];
  readonly default: string;
  /** Values that exist only for broken fixtures, which a design must not choose. */
  readonly fault?: readonly string[];
  /**
   * When the assembly doesn't set this param, take it from a neighbour: the
   * first source whose port is connected wins. Otherwise use the default.
   */
  readonly from?: readonly ParamSource[];
}

export interface PartFamily {
  readonly name: string;
  readonly params: Readonly<Record<string, ParamSpec>>;
  /** Returns a structure-issue message when resolved params cannot form this family. */
  readonly validateParams?: (params: Readonly<Record<string, string>>) => string | undefined;
  readonly build: (params: Readonly<Record<string, string>>) => PartDef;
}

interface AxisRule {
  readonly kind: string;
  /** collinear: on the main axis. parallel: same direction as the main axis. */
  readonly mode: 'collinear' | 'parallel';
}

export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly check: (r: Resolved) => Issue[];
}

export interface Domain {
  readonly name: string;
  readonly units: DomainUnits;
  readonly families: Readonly<Record<string, PartFamily>>;
  /** Mount-specific maximum nesting allowances; unspecified mounts use `TOLERANCE.interface`. */
  readonly mountAllowances?: Readonly<Record<string, number>>;
  readonly axisRules: readonly AxisRule[];
  /** Domain-specific rules, run after the core rules. */
  readonly rules?: readonly Rule[];
}

// ---- Assembly file format (JSON) ----

export interface PrefabReference {
  readonly id: string;
  /** Positive integer catalogue revision; the design loader/catalogue check this at runtime. */
  readonly version: number;
}

export interface PartAppearance {
  /** Per-instance finish by material slot, independent of the host assembly's finish. */
  readonly finish?: Readonly<Record<string, string>>;
}

export interface PartInstance {
  readonly family: string;
  readonly params?: Readonly<Record<string, string>>;
  /** Appearance belongs to this part instance, not to the assembly it is fitted to. */
  readonly appearance?: PartAppearance;
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

// ---- Resolved assembly ----
// Defined here, not in resolve.ts, because a Rule checks a Resolved and a Resolved holds its Domain:
// the three refer to each other, so they share one module.

/** A param's final value and where it came from. */
export interface ResolvedParam {
  readonly value: string;
  readonly source: 'set' | 'inherited' | 'default';
  /** For inherited values: the neighbour's param, as "part.param". */
  readonly from?: string;
}

export interface PortRef {
  readonly part: string;
  readonly port: PortDef;
}

export interface ResolvedConnection {
  readonly index: number;
  readonly conn: Connection;
  readonly from: PortRef;
  readonly to: PortRef;
  /** tree: placed a part. loop: both parts were already placed. */
  readonly role: 'tree' | 'loop' | 'unplaced';
}

export interface Resolved {
  readonly assembly: Assembly;
  readonly domain: Domain;
  /** Built definitions of every valid part instance. */
  readonly defs: ReadonlyMap<string, PartDef>;
  /** The params each valid part was built with. */
  readonly params: ReadonlyMap<string, Readonly<Record<string, ResolvedParam>>>;
  /** Transforms of the parts that could be placed. */
  readonly placed: ReadonlyMap<string, Transform>;
  /** Connections that are structurally valid. */
  readonly connections: readonly ResolvedConnection[];
  /** Structure issues. */
  readonly issues: readonly Issue[];
}
