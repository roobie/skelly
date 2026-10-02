import type { Vec3 } from '../core/math.ts';
import type { KeepOut, Solid, Vec2 } from '../core/schema.ts';
import type { MountRequirement } from './mounts.ts';

/** 1U is 11.5mm; source dimensions are rounded to the model's 0.25u grid. IDs are persisted assembly values. */
export const OPTIC_TYPE_IDS = [
  'mini-reflex',
  'tube-dot',
  'holographic',
  'fixed-prism-4x',
  'lpvo-1-6x',
  'high-mag-5-25x',
  'digital-thermal',
] as const;
export type OpticTypeId = (typeof OPTIC_TYPE_IDS)[number];

export interface OpticCatalogEntry {
  readonly id: OpticTypeId;
  readonly label: string;
  readonly reference: string;
  readonly source: string;
  readonly envelopeMm: readonly [length: number, height: number, width: number];
  readonly envelopeU: readonly [length: number, height: number, width: number];
  readonly mount: MountRequirement & { readonly description: string };
  readonly opticalAxisY: number;
  readonly ocularX: number;
  readonly eyeReliefU?: number;
  readonly eyeDatumToleranceU?: number;
  readonly solids: readonly Solid[];
  readonly keepOuts: readonly KeepOut[];
  readonly ironCoWitness: boolean;
}

const grid = (value: number): number => Math.round(value / 0.25) * 0.25;

const box = (id: string, min: Vec3, max: Vec3): Solid => {
  const low = min.map(grid);
  const high = max.map(grid);
  return {
    id,
    kind: 'box',
    box: {
      center: low.map((value, axis) => (value + high[axis]!) / 2) as unknown as Vec3,
      half: low.map((value, axis) => (high[axis]! - value) / 2) as unknown as Vec3,
    },
    slot: 'metal',
  };
};

const prism = (id: string, profile: readonly Vec2[], widthU: number): Solid => {
  const halfWidth = grid(widthU / 2);
  return {
    id,
    kind: 'extruded-polygon',
    axis: 'z',
    z: [-halfWidth, halfWidth],
    profile: profile.map(([x, y]) => [grid(x), grid(y)]),
    slot: 'metal',
  };
};

const octagonal = ({
  id,
  axis,
  span,
  center,
  halfA,
  halfB,
}: {
  readonly id: string;
  readonly axis: 'x' | 'y' | 'z';
  readonly span: readonly [number, number];
  readonly center: Vec3;
  readonly halfA: number;
  readonly halfB: number;
}): Solid => {
  const corners = [
    [-0.65, -1],
    [0.65, -1],
    [1, -0.65],
    [1, 0.65],
    [0.65, 1],
    [-0.65, 1],
    [-1, 0.65],
    [-1, -0.65],
  ] as const;
  const project = {
    x: (a: number, b: number): Vec2 => [grid(center[1] + a * halfA), grid(center[2] + b * halfB)],
    y: (a: number, b: number): Vec2 => [grid(center[2] + a * halfA), grid(center[0] + b * halfB)],
    z: (a: number, b: number): Vec2 => [grid(center[0] + a * halfA), grid(center[1] + b * halfB)],
  };
  const profile = corners.map(([a, b]) => project[axis](a, b));
  return {
    id,
    kind: 'extruded-polygon',
    axis,
    z: span.map(grid) as unknown as readonly [number, number],
    profile,
    slot: 'metal',
  };
};

const octagonalTube = ({
  id,
  x,
  centerY,
  halfY,
  halfZ,
}: {
  readonly id: string;
  readonly x: readonly [number, number];
  readonly centerY: number;
  readonly halfY: number;
  readonly halfZ: number;
}): Solid => octagonal({ id, axis: 'x', span: x, center: [0, centerY, 0], halfA: halfY, halfB: halfZ });

const silhouette = (id: string, profile: readonly Vec2[], widthU: number): Solid => prism(id, profile, widthU);

const sightline = (startX: number, axisY: number, ironCoWitness: boolean, lengthU = 34): KeepOut => ({
  id: 'sightline',
  kind: 'sightline',
  box: {
    center: [grid(startX) + grid(lengthU) / 2, grid(axisY), 0],
    half: [grid(lengthU) / 2, 0.25, 0.25],
  },
  ...(ironCoWitness ? { allowFamilies: ['front-sight', 'rail-front-sight'] } : {}),
});

const makeEntry = (
  entry: Omit<OpticCatalogEntry, 'keepOuts'> & { readonly sightlineStartX: number },
): OpticCatalogEntry => {
  const { sightlineStartX, ...rest } = entry;
  return { ...rest, keepOuts: [sightline(sightlineStartX, entry.opticalAxisY, entry.ironCoWitness)] };
};

const railMount = ({
  contactLengthU,
  contactWidthU,
  minimumSlots,
  description,
  clearanceU,
  ringSpanU,
}: {
  readonly contactLengthU: number;
  readonly contactWidthU: number;
  readonly minimumSlots: number;
  readonly description: string;
  readonly clearanceU: MountRequirement['clearanceU'];
  readonly ringSpanU?: number;
}): MountRequirement & { readonly description: string } => ({
  kind: 'rail-top',
  contactLengthU,
  contactWidthU,
  minimumSlots,
  ...(ringSpanU === undefined ? {} : { ringSpanU }),
  clearanceU,
  description,
});

/** Manufacturer-class visual envelopes; no glass, zoom, reticle, NV or thermal behavior is simulated. */
export const OPTIC_CATALOG: Readonly<Record<OpticTypeId, OpticCatalogEntry>> = {
  'mini-reflex': makeEntry({
    id: 'mini-reflex',
    label: 'Open reflex (RMR class)',
    reference: 'Trijicon RMR, 1.8 × 1.2 × 1.0 in class',
    source: 'https://www.trijicon.com/products/details/rm06-c-700672',
    envelopeMm: [46, 25, 31],
    envelopeU: [4, 2.25, 2.75],
    mount: railMount({
      contactLengthU: 3.5,
      contactWidthU: 1.5,
      minimumSlots: 2,
      description: 'single compact foot',
      clearanceU: { forward: 0.25, rearward: 0.25, lateral: 0.25 },
    }),
    opticalAxisY: 1.25,
    ocularX: -1.25,
    ironCoWitness: false,
    sightlineStartX: 1.5,
    solids: [
      box('mount-foot', [-1.75, 0, -0.75], [1.75, 0.45, 0.75]),
      silhouette(
        'front-window-prism',
        [
          [-1.5, 0.45],
          [1.5, 0.45],
          [1.5, 1.8],
          [-1.1, 2.2],
        ],
        2.75,
      ),
    ],
  }),
  'tube-dot': makeEntry({
    id: 'tube-dot',
    label: 'Tube dot (Micro T-2 class)',
    reference: 'Aimpoint Micro T-2, 68 × 41 × 41 mm class',
    source: 'https://www.aimpoint.com/products/red-dot-sights/micro-t-2',
    envelopeMm: [68, 41, 41],
    envelopeU: [6, 3.5, 3.5],
    mount: railMount({
      contactLengthU: 4,
      contactWidthU: 1.5,
      minimumSlots: 3,
      description: 'low direct foot',
      clearanceU: { forward: 0.5, rearward: 0.5, lateral: 0.35 },
    }),
    opticalAxisY: 1.25,
    ocularX: -2.5,
    ironCoWitness: false,
    sightlineStartX: 3,
    solids: [
      box('mount-foot', [-2, 0, -0.8], [2, 0.75, 0.8]),
      octagonalTube({ id: 'tube-body', x: [-2.95, 2.3], centerY: 2.3, halfY: 1.3, halfZ: 1.8 }),
    ],
  }),
  holographic: makeEntry({
    id: 'holographic',
    label: 'Holographic (EXPS3 class)',
    reference: 'EOTECH EXPS3, approximately 3.8 × 2.3 × 2.6 in class',
    source: 'https://www.eotechinc.com/eotech-hws-exps3',
    envelopeMm: [95, 56, 65],
    envelopeU: [8.25, 4.875, 5.75],
    mount: railMount({
      contactLengthU: 5.5,
      contactWidthU: 1.7,
      minimumSlots: 4,
      description: 'integral low rail foot',
      clearanceU: { forward: 0.5, rearward: 0.5, lateral: 0.5 },
    }),
    opticalAxisY: 2.5,
    ocularX: -4.0,
    ironCoWitness: false,
    sightlineStartX: 4.0,
    solids: [
      box('mount-foot', [-4.0, 0, -0.85], [4.0, 0.55, 0.85]),
      box('window-left-side', [-4.0, 0.55, -2.75], [4.0, 4.0, -1.7]),
      box('window-right-side', [-4.0, 0.55, 1.7], [4.0, 4.0, 2.75]),
      box('window-lower-rail', [-4.0, 0.55, -1.7], [4.0, 0.95, 1.7]),
      box('window-upper-rail', [-3.2, 3.9, -2.75], [3.2, 4.85, 2.75]),
      box('control-block', [-3.7, 0.55, -1.7], [-2.7, 1.8, 1.7]),
    ],
  }),
  'fixed-prism-4x': makeEntry({
    id: 'fixed-prism-4x',
    label: 'Fixed 4× prism (TA31 class)',
    reference: 'Trijicon ACOG TA31 class, including mount, approximately 150 × 45 × 60 mm',
    source: 'https://www.trijicon.com/products/details/ta31-d-100549',
    envelopeMm: [150, 45, 60],
    envelopeU: [13, 4, 5.25],
    mount: railMount({
      contactLengthU: 5.5,
      contactWidthU: 1.75,
      minimumSlots: 4,
      description: 'integral prism foot',
      clearanceU: { forward: 0.75, rearward: 0.75, lateral: 0.5 },
    }),
    opticalAxisY: 2.5,
    ocularX: -5.75,
    eyeReliefU: 3.5,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 6.5,
    solids: [
      box('integral-mount', [-2.75, 0, -0.825], [2.75, 0.65, 0.825]),
      silhouette(
        'prism-housing',
        [
          [-6.5, 0.5],
          [6.5, 0.5],
          [6.5, 1.8],
          [4.8, 3.75],
          [-4.8, 3.75],
          [-6.5, 1.8],
        ],
        5.25,
      ),
      octagonalTube({ id: 'objective-rim', x: [4.8, 6.5], centerY: 2.5, halfY: 1.25, halfZ: 2.6 }),
      octagonalTube({ id: 'ocular-rim', x: [-6.5, -4.8], centerY: 2.5, halfY: 1.25, halfZ: 2.6 }),
    ],
  }),
  'lpvo-1-6x': makeEntry({
    id: 'lpvo-1-6x',
    label: 'Low-power variable optic (Razor Gen II-E class)',
    reference: 'Vortex Razor HD Gen II-E 1–6×24, approximately 257 mm long',
    source: 'https://vortexoptics.com/razor-hd-gen-ii-e-1-6x24.html',
    envelopeMm: [257, 80, 65],
    envelopeU: [22.25, 7, 5.75],
    mount: railMount({
      contactLengthU: 8,
      contactWidthU: 1.75,
      minimumSlots: 5,
      description: 'paired cantilever rings',
      clearanceU: { forward: 1, rearward: 1, lateral: 0.75 },
      ringSpanU: 8,
    }),
    opticalAxisY: 3.75,
    ocularX: -10,
    eyeReliefU: 7.5,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 11.25,
    solids: [
      box('rear-ring-foot', [-4, 0, -0.875], [-3, 2.75, 0.875]),
      box('front-ring-foot', [3, 0, -0.875], [4, 2.75, 0.875]),
      octagonalTube({ id: 'main-tube', x: [-7.5, 7.2], centerY: 3.75, halfY: 1.2, halfZ: 1.2 }),
      octagonalTube({ id: 'ocular-bell', x: [-10, -6.7], centerY: 3.75, halfY: 1.4, halfZ: 1.25 }),
      octagonalTube({ id: 'objective-bell', x: [6.4, 12.25], centerY: 3.75, halfY: 1.75, halfZ: 1.75 }),
      octagonal({ id: 'top-turret', axis: 'y', span: [4.75, 7], center: [0, 0, 0], halfA: 0.8, halfB: 0.8 }),
      octagonal({ id: 'side-turret', axis: 'z', span: [0.9, 2.05], center: [0, 4.375, 0], halfA: 1.05, halfB: 1.05 }),
    ],
  }),
  'high-mag-5-25x': makeEntry({
    id: 'high-mag-5-25x',
    label: 'High-magnification scope (ATACR 5–25×56 class)',
    reference: 'Nightforce ATACR 5–25×56 F1 class, approximately 363 mm long',
    source: 'https://www.nightforceoptics.com/riflescopes/atacr/atacr-5-25x56-f1/',
    envelopeMm: [363, 86, 75],
    envelopeU: [31.5, 7.5, 6.5],
    mount: railMount({
      contactLengthU: 12,
      contactWidthU: 1.75,
      minimumSlots: 7,
      description: 'separated 34 mm rings',
      clearanceU: { forward: 1.25, rearward: 1.25, lateral: 1 },
      ringSpanU: 10,
    }),
    opticalAxisY: 3.75,
    ocularX: -15.75,
    eyeReliefU: 8,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15.75,
    solids: [
      box('rear-ring-foot', [-6.1, 0, -0.875], [-4.1, 2.75, 0.875]),
      box('front-ring-foot', [4.1, 0, -0.875], [6.1, 2.75, 0.875]),
      octagonalTube({ id: 'main-tube', x: [-11.5, 10], centerY: 3.75, halfY: 1.35, halfZ: 1.35 }),
      octagonalTube({ id: 'ocular-bell', x: [-15.8, -10.8], centerY: 3.75, halfY: 1.65, halfZ: 1.65 }),
      octagonalTube({ id: 'objective-bell', x: [9.5, 15.8], centerY: 3.75, halfY: 2.8, halfZ: 2.8 }),
      octagonal({ id: 'elevation-turret', axis: 'y', span: [4.75, 7.5], center: [0, 0, 0], halfA: 1.2, halfB: 1.2 }),
      octagonal({ id: 'parallax-turret', axis: 'z', span: [1.1, 3.25], center: [0, 3.875, 0], halfA: 1.5, halfB: 1.5 }),
    ],
  }),
  'digital-thermal': makeEntry({
    id: 'digital-thermal',
    label: 'Digital optic (Thermion 2 XQ50 Pro class)',
    reference: 'Pulsar Thermion 2 XQ50 Pro, approximately 343 mm long',
    source: 'https://pulsarnv.com/products/thermion-2-xq50-pro',
    envelopeMm: [343, 80, 80],
    envelopeU: [29.75, 7, 7],
    mount: railMount({
      contactLengthU: 10,
      contactWidthU: 1.75,
      minimumSlots: 6,
      description: 'dedicated rail mount',
      clearanceU: { forward: 1.25, rearward: 1.25, lateral: 1 },
      ringSpanU: 8,
    }),
    opticalAxisY: 3,
    ocularX: -15,
    eyeReliefU: 6.5,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15,
    solids: [
      box('mount-base', [-5, 0, -0.875], [5, 1, 0.875]),
      octagonalTube({ id: 'sensor-housing', x: [-8, 8], centerY: 3.4, halfY: 2.2, halfZ: 2.8 }),
      octagonalTube({ id: 'objective-housing', x: [8, 14.9], centerY: 3.4, halfY: 2.1, halfZ: 3.5 }),
      octagonalTube({ id: 'eyepiece-housing', x: [-14.9, -8], centerY: 3.4, halfY: 1.8, halfZ: 2.6 }),
      box('top-control-block', [-2.5, 5.4, -1.4], [2.5, 7, 1.4]),
      box('side-control-block', [-1.8, 2.1, 2.6], [1.8, 4.6, 3.5]),
    ],
  }),
};

export const getOptic = (id: string | undefined): OpticCatalogEntry => {
  const key = id ?? 'mini-reflex';
  const entry = OPTIC_CATALOG[key as OpticTypeId];
  if (!entry) {
    throw new Error(`Unknown sight type "${key}".`);
  }
  return entry;
};
