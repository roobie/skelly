// Revolve profiles (z, r) in millimetres for a metallic cartridge, built from its parsed data
// (roobie/skelly#109, spike). z runs from the head face (z = 0) toward the tip, as in the data format.
// Profile order and normals follow core/revolve.ts.
//
// Everything the cartridge data does not give is a named constant below, so a reader can see which
// numbers are drawn from the standard and which are looks-only assumptions.

import type { Vec2 } from '../core/schema.ts';
import type { Measure, MetallicCartridge } from './cartridge.ts';

/** Case base edge chamfer: C.I.P. `f` = 0.25 at 45 degrees, in the sheet's notes but not mapped to a field. */
export const CASE_BASE_CHAMFER_MM = 0.25;
/** ASSUMPTION: the data has no primer diameter (it is null); a large rifle primer is about 5.4 mm. */
export const PRIMER_DIAMETER_MM = 5.4;
/** ASSUMPTION: depth of the primer pocket, and how far the primer face sits below the head face. */
export const PRIMER_POCKET_DEPTH_MM = 0.4;
export const PRIMER_RECESS_MM = 0.1;
/** ASSUMPTION: gap between primer and pocket wall, so the two never share a surface. */
const PRIMER_CLEARANCE_MM = 0.05;
/** ASSUMPTION: the data has no wall thickness; a fired case is shown with a uniform wall. */
export const CASE_WALL_MM = 0.4;
/** ASSUMPTION: depth of the inside floor of the fired case, measured from the head face. */
export const FIRED_FLOOR_MM = 3;
/** ASSUMPTION: the data has no ogive shape. The nose is a tangent ogive this many calibres long. */
export const OGIVE_LENGTH_CALIBRES = 1.2;
/** Segments approximating the ogive arc. */
export const OGIVE_SEGMENTS = 8;

export interface RoundProfiles {
  /** The case closed round the seated bullet, with the primer pocket in its head. */
  readonly loadedCase: readonly Vec2[];
  /** The same case without its bullet: open at the mouth, with walls thick enough to see the inside. */
  readonly firedCase: readonly Vec2[];
  readonly bullet: readonly Vec2[];
  readonly primer: readonly Vec2[];
}

const required = (measure: Measure, label: string): number => {
  if (measure.value === null) {
    throw new Error(`cartridge has no ${label}`);
  }
  return measure.value;
};

/** The outside of the case from the chamfered head edge to the mouth, as (z, r) points. */
const caseOutline = (cartridge: MetallicCartridge): Vec2[] => {
  const c = cartridge.case;
  const rim = required(c.rim.diameter, 'rim diameter') / 2;
  const rimThickness = required(c.rim.thickness, 'rim thickness');
  const bodyHead = required(c.body.diameterAtHead, 'body diameter at head') / 2;
  const length = required(c.length, 'case length');
  const head: Vec2[] = [
    [0, rim - CASE_BASE_CHAMFER_MM],
    [CASE_BASE_CHAMFER_MM, rim],
    [rimThickness, rim],
  ];
  if (c.head.type === 'rimless') {
    const groove = c.head.extractorGroove;
    const grooveRadius = required(groove.diameter, 'extractor groove diameter') / 2;
    head.push(
      [rimThickness, grooveRadius],
      [rimThickness + required(groove.width, 'extractor groove width'), grooveRadius],
      [required(c.bodyStart, 'body start'), bodyHead],
    );
  } else {
    head.push([rimThickness, bodyHead]);
  }
  if (c.body.type === 'bottleneck') {
    const { shoulder, neck } = c.body;
    return [
      ...head,
      [required(shoulder.startPosition, 'shoulder start'), required(c.body.diameterAtShoulderStart, 'P2') / 2],
      [required(shoulder.endPosition, 'shoulder end'), required(neck.diameterAtBase, 'neck diameter at base') / 2],
      [length, required(neck.diameterAtMouth, 'neck diameter at mouth') / 2],
    ];
  }
  return [...head, [length, required(c.body.diameterAtMouth, 'diameter at mouth') / 2]];
};

/** Outside radius at axial position `z`, interpolated along the first segment that spans it. */
const radiusAt = (outline: readonly Vec2[], z: number): number => {
  for (let i = 1; i < outline.length; i++) {
    const [z0, r0] = outline[i - 1]!;
    const [z1, r1] = outline[i]!;
    if (z1 > z0 && z >= z0 && z <= z1) {
      return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
    }
  }
  throw new Error(`no case wall at z = ${z}`);
};

const primerRadius = PRIMER_DIAMETER_MM / 2;
const pocketRadius = primerRadius + PRIMER_CLEARANCE_MM;

/** Start of every case profile: the pocket floor on the axis, the pocket wall, then the head face out to the chamfer. */
const caseBase = (outline: readonly Vec2[]): Vec2[] => [
  [PRIMER_POCKET_DEPTH_MM, 0],
  [PRIMER_POCKET_DEPTH_MM, pocketRadius],
  [0, pocketRadius],
  ...outline,
];

const loadedCaseProfile = (outline: readonly Vec2[], mouth: number): Vec2[] => [...caseBase(outline), [mouth, 0]];

const firedCaseProfile = (outline: readonly Vec2[], mouth: number): Vec2[] => {
  const mouthRadius = outline.at(-1)![1];
  const inner: Vec2[] = outline
    .filter(([z]) => z > FIRED_FLOOR_MM)
    .map(([z, r]): Vec2 => [z, Math.max(r - CASE_WALL_MM, 0)])
    .reverse();
  const floorRadius = radiusAt(outline, FIRED_FLOOR_MM) - CASE_WALL_MM;
  return [
    ...caseBase(outline),
    [mouth, mouthRadius - CASE_WALL_MM],
    ...inner.slice(1),
    [FIRED_FLOOR_MM, floorRadius],
    [FIRED_FLOOR_MM, 0],
  ];
};

/** Tangent ogive from the cylinder at `zStart` (radius `radius`) to a point at `zTip`. */
const ogive = (zStart: number, zTip: number, radius: number): Vec2[] => {
  const length = zTip - zStart;
  const rho = (radius * radius + length * length) / (2 * radius);
  const phiMax = Math.asin(length / rho);
  const points: Vec2[] = [];
  for (let k = 1; k < OGIVE_SEGMENTS; k++) {
    const phi = (phiMax * k) / OGIVE_SEGMENTS;
    points.push([zStart + rho * Math.sin(phi), rho * Math.cos(phi) + radius - rho]);
  }
  return points;
};

const bulletProfile = (cartridge: MetallicCartridge): Vec2[] => {
  const radius = required(cartridge.payload.diameter, 'bullet diameter') / 2;
  const tip = required(cartridge.overallLength.typical, 'typical overall length');
  const base = tip - required(cartridge.payload.length.min, 'bullet length');
  const ogiveStart = tip - OGIVE_LENGTH_CALIBRES * radius * 2;
  // The data has no boat-tail (the Soviet ball bullets have flat bases), so none is drawn.
  return [[base, 0], [base, radius], [ogiveStart, radius], ...ogive(ogiveStart, tip, radius), [tip, 0]];
};

const primerProfile = (): Vec2[] => {
  const chamfer = 0.2;
  const faceZ = PRIMER_RECESS_MM;
  return [
    [PRIMER_POCKET_DEPTH_MM, 0],
    [PRIMER_POCKET_DEPTH_MM, primerRadius],
    [faceZ + chamfer, primerRadius],
    [faceZ, primerRadius - chamfer],
    [faceZ, 0],
  ];
};

/** Revolve profiles for a metallic cartridge, in millimetres. */
export const roundProfiles = (cartridge: MetallicCartridge): RoundProfiles => {
  const outline = caseOutline(cartridge);
  const [mouth, mouthRadius] = outline.at(-1)!;
  const bulletRadius = required(cartridge.payload.diameter, 'bullet diameter') / 2;
  if (mouthRadius <= bulletRadius) {
    throw new Error('bullet is as wide as the case mouth');
  }
  return {
    loadedCase: loadedCaseProfile(outline, mouth),
    firedCase: firedCaseProfile(outline, mouth),
    bullet: bulletProfile(cartridge),
    primer: primerProfile(),
  };
};
