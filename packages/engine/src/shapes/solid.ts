// Solid shapes in a part's local frame, and the units they are measured in. Nothing here knows about
// parts, ports or assemblies, so geometry, revolve and mesh can build on it alone.

import type { ExtrusionAxis, Vec3 } from '../foundation/math.ts';

/** Axis-aligned box in its part's local frame. */
export interface Box {
  readonly center: Vec3;
  readonly half: Vec3;
}

/** Rendering-only hints ignored by collision and rule logic; omitted options retain the viewer's bevel and outline defaults. */
export interface SolidDisplayHints {
  readonly bevel?: boolean;
  readonly outline?: boolean;
  /** Minimum crease angle for Three.js edge outlines; undefined uses its native 1° default. */
  readonly outlineAngleDeg?: number;
  /** Solids in one group are rendered/exported as one display mesh. */
  readonly mergeGroup?: string;
  /** Diagnostic role shared by convex cells of one authored component; otherwise its solid id. */
  readonly role?: string;
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
  /**
   * Optional local-frame half-spaces; each keeps the side dot(normal, p) <= offset.
   * Any clip disables beveling, even if every plane misses the solid; set display.bevel to false explicitly.
   */
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
  /** Translation of the revolution axis in the part frame; omitted means [0, 0, 0]. */
  readonly origin?: Vec3;
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
  /**
   * Turns the profile with this many flat sides instead of round: a regular polygon section whose flats face both
   * transverse axes, with the profile radius as the distance to each flat. A multiple of four, so the bounds stay
   * those of the round solid. Unlike the facet count, it is part of the shape, so mesh and collision both follow it.
   */
  readonly sides?: number;
  /** Only `outline` applies: a revolved mesh has no bevel and cannot join a merge group. */
  readonly display?: SolidDisplayHints;
}

export type Solid = BoxSolid | ExtrudedPolygonSolid | RevolvedSolid;

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
