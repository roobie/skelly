import type { KeepOut, Solid, Vec2 } from '../core/schema.ts';
import type { Vec3 } from '../core/math.ts';
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

const octagonalTube = (
  id: string,
  x: readonly [number, number],
  centerY: number,
  halfY: number,
  halfZ: number,
): Solid => {
  const profile: Vec2[] = [
    [-0.65 * halfY, -halfZ],
    [0.65 * halfY, -halfZ],
    [halfY, -0.65 * halfZ],
    [halfY, 0.65 * halfZ],
    [0.65 * halfY, halfZ],
    [-0.65 * halfY, halfZ],
    [-halfY, 0.65 * halfZ],
    [-halfY, -0.65 * halfZ],
  ].map(([y, z]) => [grid(centerY + y!), grid(z!)]);
  return { id, kind: 'extruded-polygon', axis: 'x', z: x.map(grid) as unknown as readonly [number, number], profile, slot: 'metal' };
};

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

const railMount = (
  contactLengthU: number,
  contactWidthU: number,
  minimumSlots: number,
  description: string,
  clearanceU: MountRequirement['clearanceU'],
  ringSpanU?: number,
): MountRequirement & { readonly description: string } => ({
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
    mount: railMount(3.5, 1.5, 2, 'single compact foot', { forward: 0.25, rearward: 0.25, lateral: 0.25 }),
    opticalAxisY: 1.25,
    ocularX: -1.25,
    ironCoWitness: false,
    sightlineStartX: 1.5,
    solids: [
      box('mount-foot', [-1.75, 0, -0.75], [1.75, 0.45, 0.75]),
      box('rear-window-post', [-1.55, 0.4, -0.72], [-1.05, 1.75, 0.72]),
      box('front-window-post', [0.85, 0.4, -0.72], [1.45, 1.72, 0.72]),
      box('hood-top', [-1.2, 1.7, -0.72], [1.12, 2.2, 0.72]),
    ],
  }),
  'tube-dot': makeEntry({
    id: 'tube-dot',
    label: 'Tube dot (Micro T-2 class)',
    reference: 'Aimpoint Micro T-2, 68 × 41 × 41 mm class',
    source: 'https://www.aimpoint.com/products/red-dot-sights/micro-t-2',
    envelopeMm: [68, 41, 41],
    envelopeU: [6, 3.5, 3.5],
    mount: railMount(4, 1.5, 3, 'low direct foot', { forward: 0.5, rearward: 0.5, lateral: 0.35 }),
    opticalAxisY: 1.25,
    ocularX: -2.5,
    ironCoWitness: false,
    sightlineStartX: 3,
    solids: [
      box('mount-foot', [-2, 0, -0.8], [2, 0.75, 0.8]),
      octagonalTube('tube-body', [-2.95, 2.3], 2.3, 1.3, 1.8),
    ],
  }),
  holographic: makeEntry({
    id: 'holographic',
    label: 'Holographic (EXPS3 class)',
    reference: 'EOTECH EXPS3, 3.8 × 2.9 × 2.0 in class',
    source: 'https://www.eotechinc.com/eotech-hws-exps3',
    envelopeMm: [97, 74, 51],
    envelopeU: [8.5, 6.5, 4.5],
    mount: railMount(5.5, 1.7, 4, 'integral low rail foot', { forward: 0.5, rearward: 0.5, lateral: 0.5 }),
    opticalAxisY: 3.0,
    ocularX: -4.2,
    ironCoWitness: false,
    sightlineStartX: 4.2,
    solids: [
      box('mount-foot', [-4.2, 0, -0.85], [4.2, 0.65, 0.85]),
      box('window-left-side', [-4.2, 0.65, -2.2], [4.2, 5.35, -1.45]),
      box('window-right-side', [-4.2, 0.65, 1.45], [4.2, 5.35, 2.2]),
      box('window-lower-rail', [-4.2, 0.65, -1.45], [4.2, 1.15, 1.45]),
      box('window-upper-rail', [-3.5, 5.3, -2.2], [3.5, 6.4, 2.2]),
      box('control-block', [-3.8, 0.65, -1.4], [-2.7, 2.1, 1.4]),
    ],
  }),
  'fixed-prism-4x': makeEntry({
    id: 'fixed-prism-4x',
    label: 'Fixed 4× prism (TA31 class)',
    reference: 'Trijicon ACOG TA31, approximately 147 × 71 × 51 mm',
    source: 'https://www.trijicon.com/products/details/ta31-d-100549',
    envelopeMm: [147, 71, 51],
    envelopeU: [12.75, 6.25, 4.5],
    mount: railMount(8, 1.75, 5, 'integral prism foot', { forward: 0.75, rearward: 0.75, lateral: 0.5 }),
    opticalAxisY: 3.25,
    ocularX: -5.75,
    eyeReliefU: 3.5,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 6.5,
    solids: [
      box('integral-mount', [-3.3, 0, -0.825], [3.3, 0.7, 0.825]),
      silhouette(
        'prism-housing',
        [
          [-6.4, 0.55],
          [6.4, 0.55],
          [6.4, 2.2],
          [4.8, 5.9],
          [-4.8, 5.9],
          [-6.4, 2.2],
        ],
        4.4,
      ),
      box('objective-rim', [4.8, 1.2, -2.15], [6.4, 5.9, 2.15]),
      box('ocular-rim', [-6.4, 1.0, -2.15], [-4.8, 5.8, 2.15]),
    ],
  }),
  'lpvo-1-6x': makeEntry({
    id: 'lpvo-1-6x',
    label: 'Low-power variable optic (Razor Gen II-E class)',
    reference: 'Vortex Razor HD Gen II-E 1–6×24, approximately 257 mm long',
    source: 'https://vortexoptics.com/razor-hd-gen-ii-e-1-6x24.html',
    envelopeMm: [257, 80, 65],
    envelopeU: [22.25, 7, 5.75],
    mount: railMount(8, 1.75, 5, 'paired cantilever rings', { forward: 1, rearward: 1, lateral: 0.75 }, 8),
    opticalAxisY: 3.75,
    ocularX: -11.25,
    eyeReliefU: 7.5,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 11.25,
    solids: [
      box('rear-ring-foot', [-4.9, 0, -0.875], [-3.1, 2.75, 0.875]),
      box('front-ring-foot', [3.1, 0, -0.875], [4.9, 2.75, 0.875]),
      octagonalTube('main-tube', [-7.5, 7.2], 3.75, 1.2, 1.2),
      octagonalTube('ocular-bell', [-11.15, -6.7], 3.75, 1.55, 1.55),
      octagonalTube('objective-bell', [6.4, 11.15], 3.75, 1.75, 1.75),
      box('top-turret', [-1.05, 4.75, -0.8], [1.05, 7, 0.8]),
      box('side-turret', [-1.05, 3.25, 0.9], [1.05, 5.5, 2.05]),
    ],
  }),
  'high-mag-5-25x': makeEntry({
    id: 'high-mag-5-25x',
    label: 'High-magnification scope (ATACR 5–25×56 class)',
    reference: 'Nightforce ATACR 5–25×56 F1 class, approximately 363 mm long',
    source: 'https://www.nightforceoptics.com/riflescopes/atacr/atacr-5-25x56-f1/',
    envelopeMm: [363, 86, 75],
    envelopeU: [31.5, 7.5, 6.5],
    mount: railMount(12, 1.75, 7, 'separated 34 mm rings', { forward: 1.25, rearward: 1.25, lateral: 1 }, 10),
    opticalAxisY: 2.5,
    ocularX: -15.75,
    eyeReliefU: 8,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15.75,
    solids: [
      box('rear-ring-foot', [-6.1, 0, -0.875], [-4.1, 2.3, 0.875]),
      box('front-ring-foot', [4.1, 0, -0.875], [6.1, 2.3, 0.875]),
      octagonalTube('main-tube', [-11.5, 10], 2.55, 1.35, 1.35),
      octagonalTube('ocular-bell', [-15.8, -10.8], 2.55, 1.65, 1.65),
      octagonalTube('objective-bell', [9.5, 15.8], 2.55, 2.8, 2.8),
      box('elevation-turret', [-1.5, 3.8, -1.2], [1.5, 7.5, 1.2]),
      box('parallax-turret', [-1.5, 2.1, 1.1], [1.5, 4.8, 3.25]),
    ],
  }),
  'digital-thermal': makeEntry({
    id: 'digital-thermal',
    label: 'Digital optic (Thermion 2 XQ50 Pro class)',
    reference: 'Pulsar Thermion 2 XQ50 Pro, approximately 343 mm long',
    source: 'https://pulsarnv.com/products/thermion-2-xq50-pro',
    envelopeMm: [343, 80, 80],
    envelopeU: [29.75, 7, 7],
    mount: railMount(10, 1.75, 6, 'dedicated rail mount', { forward: 1.25, rearward: 1.25, lateral: 1 }, 8),
    opticalAxisY: 3,
    ocularX: -15,
    eyeReliefU: 6.5,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15,
    solids: [
      box('mount-base', [-5, 0, -0.875], [5, 1, 0.875]),
      box('sensor-housing', [-8, 1, -2.8], [8, 5.8, 2.8]),
      box('objective-housing', [8, 1.4, -3.5], [14.9, 5.5, 3.5]),
      box('eyepiece-housing', [-14.9, 1.6, -2.6], [-8, 5.2, 2.6]),
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
