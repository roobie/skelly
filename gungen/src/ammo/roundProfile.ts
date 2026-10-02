// Revolve profiles (axial, radius) in millimetres, derived from sourced metallic-cartridge data.
// Unspecified internal construction is explicit here as a named modelling assumption.

import type { Measure, MetallicCartridge } from './cartridge.ts';

export type ProfilePoint = readonly [axialMm: number, radiusMm: number];

/** C.I.P. 7.62x39 base-edge chamfer f; the data file records it in its notes, not as a field. */
export const CASE_BASE_CHAMFER_MM = 0.25;
/** Modelling assumption: a large-rifle primer is about 5.4 mm across; cartridge data has no diameter. */
export const PRIMER_DIAMETER_MM = 5.4;
/** Modelling assumption: primer-pocket depth and the rear of the pocket floor. */
export const PRIMER_POCKET_DEPTH_MM = 0.4;
/** Modelling assumption: primer face sits below the case head. */
export const PRIMER_RECESS_MM = 0.1;
/** Modelling assumption: radial clearance between primer and pocket wall. */
export const PRIMER_CLEARANCE_MM = 0.05;
/** Modelling assumption: uniform fired-case wall thickness; the source data gives no wall thickness. */
export const CASE_WALL_MM = 0.4;
/** Modelling assumption: inside floor depth of the open fired case. */
export const FIRED_FLOOR_MM = 3;
/** Modelling assumption: tangent-ogive length in calibres; source data gives no projectile profile. */
export const OGIVE_LENGTH_CALIBRES = 1.2;
/** Modelling assumption used only when source bullet length is null: seated depth in calibres. */
export const ASSUMED_BULLET_SEATING_DEPTH_CALIBRES = 1.5;
/** Number of linear segments used to represent the ogive. */
export const OGIVE_SEGMENTS = 8;

export interface RoundProfiles {
  /** Case closed around its seated projectile. */
  readonly loadedCase: readonly ProfilePoint[];
  /** Open fired case with a visible wall and closed internal floor. */
  readonly firedCase: readonly ProfilePoint[];
  readonly bullet: readonly ProfilePoint[];
  readonly primer: readonly ProfilePoint[];
}

const required = (measure: Measure, label: string): number => {
  if (measure.value === null) {
    throw new Error(`cartridge has no ${label}`);
  }
  return measure.value;
};

/** Sourced outer case outline, from the head face toward the mouth. */
const caseOutline = (cartridge: MetallicCartridge): ProfilePoint[] => {
  const cartridgeCase = cartridge.case;
  const rimRadius = required(cartridgeCase.rim.diameter, 'rim diameter') / 2;
  const rimThickness = required(cartridgeCase.rim.thickness, 'rim thickness');
  const bodyRadius = required(cartridgeCase.body.diameterAtHead, 'body diameter at head') / 2;
  const length = required(cartridgeCase.length, 'case length');
  const head: ProfilePoint[] = [
    [0, rimRadius - CASE_BASE_CHAMFER_MM],
    [CASE_BASE_CHAMFER_MM, rimRadius],
    [rimThickness, rimRadius],
  ];
  if (cartridgeCase.head.type === 'rimless') {
    const groove = cartridgeCase.head.extractorGroove;
    const grooveRadius = required(groove.diameter, 'extractor groove diameter') / 2;
    head.push(
      [rimThickness, grooveRadius],
      [rimThickness + required(groove.width, 'extractor groove width'), grooveRadius],
      [required(cartridgeCase.bodyStart, 'body start'), bodyRadius],
    );
  } else {
    head.push([rimThickness, bodyRadius]);
  }
  if (cartridgeCase.body.type === 'bottleneck') {
    const { shoulder, neck } = cartridgeCase.body;
    return [
      ...head,
      [
        required(shoulder.startPosition, 'shoulder start'),
        required(cartridgeCase.body.diameterAtShoulderStart, 'shoulder-start diameter') / 2,
      ],
      [required(shoulder.endPosition, 'shoulder end'), required(neck.diameterAtBase, 'neck diameter at base') / 2],
      [length, required(neck.diameterAtMouth, 'neck diameter at mouth') / 2],
    ];
  }
  return [...head, [length, required(cartridgeCase.body.diameterAtMouth, 'diameter at mouth') / 2]];
};

/** Linear outer-wall radius at axial position; undefined gaps indicate malformed source geometry. */
const radiusAt = (outline: readonly ProfilePoint[], axial: number): number => {
  for (let i = 1; i < outline.length; i++) {
    const [a0, r0] = outline[i - 1]!;
    const [a1, r1] = outline[i]!;
    if (a1 > a0 && axial >= a0 && axial <= a1) {
      return r0 + ((r1 - r0) * (axial - a0)) / (a1 - a0);
    }
  }
  throw new Error(`no case wall at axial position ${axial} mm`);
};

const primerRadius = PRIMER_DIAMETER_MM / 2;
const pocketRadius = primerRadius + PRIMER_CLEARANCE_MM;

/** Primer pocket floor, pocket wall, head face, then the external outline. */
const caseBase = (outline: readonly ProfilePoint[]): ProfilePoint[] => [
  [PRIMER_POCKET_DEPTH_MM, 0],
  [PRIMER_POCKET_DEPTH_MM, pocketRadius],
  [0, pocketRadius],
  ...outline,
];

const loadedCaseProfile = (outline: readonly ProfilePoint[], mouth: number): ProfilePoint[] => [
  ...caseBase(outline),
  [mouth, 0],
];

const firedCaseProfile = (outline: readonly ProfilePoint[], mouth: number): ProfilePoint[] => {
  const [, mouthRadius] = outline.at(-1)!;
  const inner = outline
    .filter(([axial]) => axial > FIRED_FLOOR_MM)
    .map(([axial, radius]): ProfilePoint => [axial, Math.max(radius - CASE_WALL_MM, 0)])
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

/** Tangent-ogive points between a cylindrical projectile section and its tip. */
const ogive = (start: number, tip: number, radius: number): ProfilePoint[] => {
  const length = tip - start;
  const circleRadius = (radius * radius + length * length) / (2 * radius);
  const maximumAngle = Math.asin(length / circleRadius);
  const points: ProfilePoint[] = [];
  for (let step = 1; step < OGIVE_SEGMENTS; step++) {
    const angle = (maximumAngle * step) / OGIVE_SEGMENTS;
    points.push([start + circleRadius * Math.sin(angle), circleRadius * Math.cos(angle) + radius - circleRadius]);
  }
  return points;
};

const bulletProfile = (cartridge: MetallicCartridge): ProfilePoint[] => {
  const radius = required(cartridge.payload.diameter, 'bullet diameter') / 2;
  const tip = required(cartridge.overallLength.typical, 'typical overall length');
  const caseLength = required(cartridge.case.length, 'case length');
  const sourcedLength = cartridge.payload.length.min.value;
  const bulletLength = sourcedLength ?? tip - caseLength + ASSUMED_BULLET_SEATING_DEPTH_CALIBRES * radius * 2;
  const base = tip - bulletLength;
  const ogiveStart = tip - OGIVE_LENGTH_CALIBRES * radius * 2;
  return [[base, 0], [base, radius], [ogiveStart, radius], ...ogive(ogiveStart, tip, radius), [tip, 0]];
};

const primerProfile = (): ProfilePoint[] => {
  const chamfer = 0.2;
  const face = PRIMER_RECESS_MM;
  return [
    [face, 0],
    [face, primerRadius - chamfer],
    [face + chamfer, primerRadius],
    [PRIMER_POCKET_DEPTH_MM, primerRadius],
    [PRIMER_POCKET_DEPTH_MM, 0],
  ];
};

/** Axial extent of the case body held by magazine feed lips. */
export const lipCoverMm = (cartridge: MetallicCartridge): number =>
  cartridge.case.body.type === 'bottleneck'
    ? required(cartridge.case.body.shoulder.startPosition, 'shoulder start')
    : required(cartridge.case.length, 'case length');

/** Build sourced outer profiles plus clearly named internal/projectile assumptions, all in millimetres. */
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
