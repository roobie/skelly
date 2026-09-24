// Domain-agnostic data model: parts, ports, keep-out volumes, assemblies.
// Everything domain-specific (which parts and mount types exist) is data
// supplied through a Domain.

import type { Vec3 } from './math.ts';

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
  /** One-to-many ports (e.g. a rail). Slot k sits at pos + up * k * pitch. */
  readonly slots?: { readonly count: number; readonly pitch: number };
}

export interface Solid {
  readonly id: string;
  readonly box: Box;
}

/** Space that must stay empty (PROJECT.md §3). */
export interface KeepOut {
  readonly id: string;
  readonly kind: string;
  readonly box: Box;
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
  readonly keepOuts: readonly KeepOut[];
  readonly axes: readonly Axis[];
}

export interface ParamSpec {
  readonly values: readonly string[];
  readonly default: string;
}

/** A parametric family of parts (PROJECT.md §7). */
export interface PartFamily {
  readonly name: string;
  readonly params: Readonly<Record<string, ParamSpec>>;
  build(params: Readonly<Record<string, string>>): PartDef;
}

export interface AxisRule {
  readonly kind: string;
  /** collinear: on the main axis. parallel: same direction as the main axis. */
  readonly mode: 'collinear' | 'parallel';
}

export interface Domain {
  readonly name: string;
  readonly families: Readonly<Record<string, PartFamily>>;
  readonly axisRules: readonly AxisRule[];
}

// ---- Assembly file format (JSON) ----

export interface PartInstance {
  readonly family: string;
  readonly params?: Readonly<Record<string, string>>;
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
