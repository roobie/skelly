// Domain-agnostic data model: parts, ports, keep-out volumes, assemblies.
// Everything domain-specific (which parts and mount types exist) is data
// supplied through a Domain.

import type { Issue } from './issue.ts';
import type { ExtrusionAxis, Vec3 } from './math.ts';
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

/** Rendering-only hints ignored by collision and rule logic; omitted options retain the viewer's bevel and outline defaults. */
export interface SolidDisplayHints {
  readonly bevel?: boolean;
  readonly outline?: boolean;
  /** Solids in one group are rendered/exported as one receiver display mesh. */
  readonly mergeGroup?: string;
}

export interface SolidFinish {
  /** Material id for this solid, taking precedence over its owning part and palette defaults. */
  readonly material?: string;
  /** Slot id for this solid; otherwise inherited from its part or role. */
  readonly slot?: string;
}

export interface BoxSolid extends SolidFinish {
  readonly id: string;
  readonly kind: 'box';
  readonly box: Box;
  readonly display?: SolidDisplayHints;
}

export type Vec2 = readonly [number, number];

export interface ClipPlane {
  readonly normal: Vec3;
  /** Keeps the half-space where dot(normal, point) <= offset. */
  readonly offset: number;
}

export interface ExtrudedPolygonSolid extends SolidFinish {
  readonly id: string;
  readonly kind: 'extruded-polygon';
  /** Convex CCW profile: X uses (Y,Z), Y uses (Z,X), and Z uses (X,Y), keeping profile × axis right-handed. */
  readonly profile: readonly Vec2[];
  /** Extrusion direction; omission keeps existing solids on local Z. */
  readonly axis?: ExtrusionAxis;
  /** Bounds along `axis` (legacy name `z` retained for existing solids). */
  readonly z: readonly [number, number];
  /** Optional local-frame half-spaces; each keeps the side dot(normal, p) <= offset. */
  readonly clip?: readonly ClipPlane[];
  readonly display?: SolidDisplayHints;
}

/**
 * A profile turned about one axis of the part frame. Collision uses the convex hull of the turned
 * profile, so grooves and hollows are ignored. The facet count is not part of the solid: it is chosen
 * when a mesh is built (a level of detail), while collision always uses a fixed ring count.
 */
export interface RevolvedSolid extends SolidFinish {
  readonly id: string;
  readonly kind: 'revolved';
  /**
   * (axial, radial) points with radial >= 0. Traversed so the material lies to the left of travel: a
   * closed solid runs from the axis out along its base, along the outside, and back to the axis; a
   * hollow one goes out along the outside, across the mouth and back along the inside.
   */
  readonly profile: readonly Vec2[];
  /** The axis turned about, with the same axial and transverse coordinates as ExtrudedPolygonSolid; omission keeps local Z. */
  readonly axis?: ExtrusionAxis;
  /** A profile bend sharper than this keeps a hard edge in the mesh; softer bends are smoothed. Defaults to 40. */
  readonly creaseDegrees?: number;
  /** Only `outline` applies: a revolved mesh has no bevel and cannot join a merge group. */
  readonly display?: SolidDisplayHints;
}

export type Solid = BoxSolid | ExtrudedPolygonSolid | RevolvedSolid;

/** Space that must stay empty (PROJECT.md §3). A convex extrusion may refine its broad-phase box. */
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
  /** Parts from these families may occupy the volume (e.g. a front sight in a rear sight's sightline). */
  readonly allowFamilies?: readonly string[];
}

/** A named axis on a part, such as a bore or a sight line. */
export interface Axis {
  readonly kind: string;
  readonly origin: Vec3;
  readonly dir: Vec3;
}

export interface PartMotion {
  readonly kind: 'linear';
  /** Local unit direction of travel, from rest toward rearmost. */
  readonly axis: Vec3;
  readonly rest: Vec3;
  readonly rearmost: Vec3;
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
export interface ParamSource {
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

/**
 * What one length unit (u) means in a domain. Every domain converts to metres, which is the shared frame
 * for exports and for scenes that mix domains.
 */
export interface DomainUnits {
  /** Metres per u. */
  readonly metresPerUnit: number;
  /** Authoring snap step in u. Also the largest gap that still counts as two solids touching at a connection. */
  readonly grid: number;
  /** Inset of the chamfer on box and extruded-polygon display meshes, in u. */
  readonly bevel: number;
}

export interface Domain {
  readonly name: string;
  readonly units: DomainUnits;
  readonly families: Readonly<Record<string, PartFamily>>;
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
