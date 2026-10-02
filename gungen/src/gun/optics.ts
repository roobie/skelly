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

const turned = (id: string, axis: 'x' | 'y' | 'z', origin: Vec3, profile: readonly Vec2[]): Solid => ({
  id,
  kind: 'revolved',
  axis,
  origin,
  profile,
  slot: 'metal',
});

const cylinder = (
  id: string,
  axis: 'x' | 'y' | 'z',
  origin: Vec3,
  { span, radius }: { readonly span: readonly [number, number]; readonly radius: number },
): Solid =>
  turned(id, axis, origin, [
    [span[0], 0],
    [span[0], radius],
    [span[1], radius],
    [span[1], 0],
  ]);

/** One hollow turned body: ocular flare, main tube and objective flare share their axis. */
const scopeBody = (id: string, centerY: number, outside: readonly Vec2[], wall = 0.25): Solid =>
  turned(
    id,
    'x',
    [0, centerY, 0],
    [...outside, ...outside.toReversed().map(([axial, radius]): Vec2 => [axial, radius - wall]), outside[0]!],
  );

const ringBand = (id: string, centerX: number, centerY: number, radius: number): Solid =>
  scopeBody(
    id,
    centerY,
    [
      [centerX - 0.5, radius + 0.25],
      [centerX + 0.5, radius + 0.25],
    ],
    0.25,
  );

/** Two receiver-seated bases straddle a top-loading port; the optic can bridge above it. */
const pairedFeet = (height: number): readonly Solid[] => [
  box('rear-ring-foot', [-6, 0, -0.875], [-5, height, 0.875]),
  box('front-ring-foot', [5, 0, -0.875], [6, height, 0.875]),
];

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

const MICRO_HOUSING_DISPLAY = { bevel: false, outline: false, mergeGroup: 'micro-housing' } as const;

/** Manufacturer-class visual envelopes; no glass, zoom, reticle, NV or thermal behavior is simulated. */
export const OPTIC_CATALOG: Readonly<Record<OpticTypeId, OpticCatalogEntry>> = {
  'mini-reflex': makeEntry({
    id: 'mini-reflex',
    label: 'Closed micro dot (ACRO P-2 class)',
    reference:
      'Aimpoint ACRO P-2, 47 × 33 × 31 mm (L × W × H); modeled at BR’s approximately 51 × 30 × 30 mm mounted class',
    source: 'https://aimpoint.us/acro-p-2-red-dot-reflex-sight-3-5-moa-200691/',
    envelopeMm: [47, 31, 33],
    envelopeU: [4.5, 2.75, 2.75],
    mount: railMount({
      contactLengthU: 3.5,
      contactWidthU: 1.5,
      minimumSlots: 2,
      description: 'single compact foot',
      clearanceU: { forward: 0.25, rearward: 0.25, lateral: 0.25 },
    }),
    opticalAxisY: 1.5,
    ocularX: -2.25,
    ironCoWitness: true,
    sightlineStartX: 2.25,
    solids: [
      box('mount-foot', [-1.75, 0, -0.75], [1.75, 0.5, 0.75]),
      { ...box('housing-floor', [-2.25, 0.5, -1.25], [2.25, 1, 1.25]), display: MICRO_HOUSING_DISPLAY },
      // The side walls and roof form a single closed-emitter silhouette, with a tunnel, not a filled prism.
      {
        id: 'housing-left',
        kind: 'extruded-polygon',
        axis: 'x',
        z: [-2.25, 2.25],
        profile: [
          [0.5, -1.25],
          [2.25, -1.25],
          [2.75, -0.75],
          [1, -0.75],
        ],
        clip: [{ normal: [1, 1, 0], offset: 4.5 }],
        display: MICRO_HOUSING_DISPLAY,
        slot: 'metal',
      },
      {
        id: 'housing-right',
        kind: 'extruded-polygon',
        axis: 'x',
        z: [-2.25, 2.25],
        profile: [
          [1, 0.75],
          [2.75, 0.75],
          [2.25, 1.25],
          [0.5, 1.25],
        ],
        clip: [{ normal: [1, 1, 0], offset: 4.5 }],
        display: MICRO_HOUSING_DISPLAY,
        slot: 'metal',
      },
      {
        ...silhouette(
          'sloped-front-hood',
          [
            [-2.25, 2.25],
            [2.25, 2.25],
            [1.75, 2.75],
            [-2.25, 2.75],
          ],
          1.5,
        ),
        display: MICRO_HOUSING_DISPLAY,
      },
      cylinder('rear-left-adjustment-dial-lower', 'z', [-1.25, 1.25, 0], { span: [-1.5, -1.25], radius: 0.375 }),
      cylinder('rear-left-adjustment-dial-upper', 'z', [-1.25, 2.125, 0], { span: [-1.5, -1.25], radius: 0.375 }),
    ],
  }),
  'tube-dot': makeEntry({
    id: 'tube-dot',
    label: 'Tube dot (Micro T-2 class)',
    reference: 'Aimpoint Micro T-2, 68 × 41 × 41 mm class',
    source: 'https://www.aimpoint.com/products/red-dot-sights/micro-t-2',
    envelopeMm: [68, 41, 41],
    envelopeU: [6, 3.5, 3],
    mount: railMount({
      contactLengthU: 4,
      contactWidthU: 1.5,
      minimumSlots: 3,
      description: 'low direct foot',
      clearanceU: { forward: 0.5, rearward: 0.5, lateral: 0.35 },
    }),
    opticalAxisY: 2,
    ocularX: -3,
    ironCoWitness: true,
    sightlineStartX: 3,
    solids: [
      box('mount-foot', [-2, 0, -0.8], [2, 0.75, 0.8]),
      scopeBody('tube-body', 2, [
        [-3, 1.5],
        [3, 1.5],
      ]),
    ],
  }),
  holographic: makeEntry({
    id: 'holographic',
    label: 'Compact holographic (XPS2 class)',
    reference: 'EOTECH XPS2, 96.5 × 53.3 × 63.5 mm (L × W × H); deliberately about 8% smaller at BR’s visual request',
    source: 'https://www.eotechinc.com/eotech-hws-xps2',
    envelopeMm: [96.5, 63.5, 53.3],
    envelopeU: [7.75, 5, 4.5],
    mount: railMount({
      contactLengthU: 5.5,
      contactWidthU: 1.7,
      minimumSlots: 4,
      description: 'integral low rail foot',
      clearanceU: { forward: 0.5, rearward: 0.5, lateral: 0.5 },
    }),
    opticalAxisY: 3,
    ocularX: -3.75,
    ironCoWitness: true,
    sightlineStartX: 4,
    solids: [
      box('mount-foot', [-2.75, 0, -0.75], [2.75, 0.5, 0.75]),
      box('lower-battery-section', [-3.75, 0.5, -2.25], [4, 1.5, 2.25]),
      box('forward-battery-cap', [0.25, 1.5, -2.25], [4, 2, 2.25]),
      box('window-left-side', [-3.75, 1.5, -2.25], [0.25, 4.25, -1.5]),
      box('window-right-side', [-3.75, 1.5, 1.5], [0.25, 4.25, 2.25]),
      {
        id: 'window-hood-roof',
        kind: 'extruded-polygon',
        axis: 'x',
        z: [-3.75, 0.25],
        profile: [
          [4.25, -2.25],
          [5, -1.5],
          [5, 1.5],
          [4.25, 2.25],
        ],
        slot: 'metal',
      },
    ],
  }),
  'fixed-prism-4x': makeEntry({
    id: 'fixed-prism-4x',
    label: 'Fixed 4× prism (TA31 class)',
    reference: 'Trijicon ACOG TA31 class, including mount, approximately 150 × 45 × 60 mm',
    source: 'https://www.trijicon.com/products/details/ta31-d-100549',
    envelopeMm: [150, 45, 60],
    envelopeU: [13, 3.75, 5.5],
    mount: railMount({
      contactLengthU: 12,
      contactWidthU: 1.75,
      minimumSlots: 7,
      description: 'two-base prism bridge mount',
      clearanceU: { forward: 0.75, rearward: 0.75, lateral: 0.5 },
    }),
    opticalAxisY: 2.25,
    ocularX: -6.5,
    eyeReliefU: 3.5,
    eyeDatumToleranceU: 8,
    ironCoWitness: true,
    sightlineStartX: 6.5,
    solids: [
      ...pairedFeet(0.75),
      box('mount-bridge', [-6, 0.75, -0.825], [6, 1, 0.825]),
      {
        id: 'prism-housing',
        kind: 'extruded-polygon',
        axis: 'x',
        z: [-3.25, 2.25],
        profile: [
          [0.75, -2.25],
          [1.25, -2.75],
          [2.75, -2.75],
          [3.5, -2],
          [3.5, 1.75],
          [2.75, 2.25],
          [1.25, 2.25],
          [0.75, 1.75],
        ],
        slot: 'metal',
      },
      scopeBody('objective-bell', 2.25, [
        [2, 0.875],
        [3, 1.125],
        [5, 1.25],
        [6.5, 1.25],
      ]),
      scopeBody('ocular-bell', 2.25, [
        [-6.5, 1],
        [-4.5, 1],
        [-3.5, 0.875],
        [-3, 0.875],
      ]),
      silhouette(
        'illumination-hood',
        [
          [0, 3.5],
          [2, 3.5],
          [1.5, 3.75],
          [0.25, 3.75],
        ],
        0.75,
      ),
      cylinder('elevation-cap', 'y', [-1.5, 0, 0], { span: [3.25, 3.75], radius: 0.5 }),
      cylinder('windage-cap', 'z', [-1.5, 2.25, 0], { span: [2, 2.75], radius: 0.5 }),
      cylinder('mount-cross-bolt', 'z', [-5.5, 0.375, 0], { span: [-1.25, 1.25], radius: 0.25 }),
    ],
  }),
  'lpvo-1-6x': makeEntry({
    id: 'lpvo-1-6x',
    label: 'Low-power variable optic (Razor Gen II-E class)',
    reference: 'Vortex Razor HD Gen II-E 1–6×24, approximately 257 mm long',
    source: 'https://vortexoptics.com/razor-hd-gen-ii-e-1-6x24.html',
    envelopeMm: [257, 80, 65],
    envelopeU: [22.25, 4.75, 4.5],
    mount: railMount({
      contactLengthU: 12,
      contactWidthU: 1.75,
      minimumSlots: 7,
      description: 'paired receiver rings',
      clearanceU: { forward: 1, rearward: 1, lateral: 0.75 },
      ringSpanU: 12,
    }),
    opticalAxisY: 2,
    ocularX: -10,
    eyeReliefU: 7.5,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 11.25,
    solids: [
      ...pairedFeet(1),
      scopeBody('tube-with-flared-bells', 2, [
        [-10, 1.5],
        [-7.5, 1.5],
        [-6.75, 1.25],
        [7.25, 1.25],
        [9, 1.75],
        [12.25, 1.75],
      ]),
      ringBand('rear-ring-band', -5.5, 2, 1.25),
      ringBand('front-ring-band', 5.5, 2, 1.25),
      cylinder('top-turret', 'y', [0, 0, 0], { span: [3, 4.75], radius: 0.75 }),
      cylinder('side-turret', 'z', [0, 2, 0], { span: [1, 2.75], radius: 1 }),
    ],
  }),
  'high-mag-5-25x': makeEntry({
    id: 'high-mag-5-25x',
    label: 'High-magnification scope (ATACR 5–25×56 class)',
    reference: 'Nightforce ATACR 5–25×56 F1 class, approximately 363 mm long',
    source: 'https://www.nightforceoptics.com/riflescopes/atacr/atacr-5-25x56-f1/',
    envelopeMm: [363, 86, 75],
    envelopeU: [31.5, 6.25, 6],
    mount: railMount({
      contactLengthU: 12,
      contactWidthU: 1.75,
      minimumSlots: 7,
      description: 'separated 34 mm rings',
      clearanceU: { forward: 1.25, rearward: 1.25, lateral: 1 },
      ringSpanU: 12,
    }),
    opticalAxisY: 3,
    ocularX: -15.75,
    eyeReliefU: 8,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15.75,
    solids: [
      ...pairedFeet(1.75),
      scopeBody('tube-with-flared-bells', 3, [
        [-15.75, 1.75],
        [-11.5, 1.75],
        [-10.75, 1.5],
        [8, 1.5],
        [10.5, 2.75],
        [15.75, 2.75],
      ]),
      ringBand('rear-ring-band', -5.5, 3, 1.5),
      ringBand('front-ring-band', 5.5, 3, 1.5),
      cylinder('elevation-turret', 'y', [0, 0, 0], { span: [4, 6.25], radius: 1.25 }),
      cylinder('parallax-turret', 'z', [0, 3, 0], { span: [1.25, 3.25], radius: 1.5 }),
    ],
  }),
  'digital-thermal': makeEntry({
    id: 'digital-thermal',
    label: 'Digital optic (Thermion 2 XQ50 Pro class)',
    reference: 'Pulsar Thermion 2 XQ50 Pro, approximately 343 mm long',
    source: 'https://pulsarnv.com/products/thermion-2-xq50-pro',
    envelopeMm: [343, 80, 80],
    envelopeU: [29.75, 7.5, 6.75],
    mount: railMount({
      contactLengthU: 12,
      contactWidthU: 1.75,
      minimumSlots: 7,
      description: 'paired receiver rings',
      clearanceU: { forward: 1.25, rearward: 1.25, lateral: 1 },
      ringSpanU: 12,
    }),
    opticalAxisY: 4.25,
    ocularX: -15,
    eyeReliefU: 6.5,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15,
    solids: [
      ...pairedFeet(3),
      scopeBody('sensor-tube-with-flared-bells', 4.25, [
        [-15, 2],
        [-10, 2],
        [-8, 1.5],
        [7, 1.5],
        [10, 3.25],
        [14.75, 3.25],
      ]),
      ringBand('rear-ring-band', -5.5, 4.25, 1.5),
      ringBand('front-ring-band', 5.5, 4.25, 1.5),
      cylinder('top-control-turret', 'y', [0, 0, 0], { span: [5.25, 7.5], radius: 1.25 }),
      cylinder('side-control-turret', 'z', [0, 4.25, 0], { span: [1.25, 3.5], radius: 1.25 }),
    ],
  }),
};

/** Raise only the AR-mounted scope: its rear ocular must clear the charging-handle travel. */
const raisedScope = (optic: OpticCatalogEntry, lift: number): OpticCatalogEntry => ({
  ...optic,
  envelopeU: [optic.envelopeU[0], optic.envelopeU[1] + lift, optic.envelopeU[2]],
  opticalAxisY: optic.opticalAxisY + lift,
  solids: optic.solids.map((solid): Solid => {
    if (solid.kind === 'box') {
      const { center, half } = solid.box;
      return {
        ...solid,
        box: { center: [center[0], center[1] + lift / 2, center[2]], half: [half[0], half[1] + lift / 2, half[2]] },
      };
    }
    if (solid.kind !== 'revolved') {
      throw new Error('Scope components must be revolved or mount feet.');
    }
    const [x, y, z] = solid.origin ?? [0, 0, 0];
    return { ...solid, origin: [x, y + lift, z] };
  }),
  keepOuts: optic.keepOuts.map((volume) => ({
    ...volume,
    box: { ...volume.box, center: [volume.box.center[0], volume.box.center[1] + lift, volume.box.center[2]] },
  })),
});

const AR_SCOPES: Partial<Readonly<Record<OpticTypeId, OpticCatalogEntry>>> = {
  // Its ocular clears rear handle travel at the AR's forward receiver station; this lift clears the irons.
  'lpvo-1-6x': raisedScope(OPTIC_CATALOG['lpvo-1-6x'], 1),
  'high-mag-5-25x': raisedScope(OPTIC_CATALOG['high-mag-5-25x'], 1.5),
};

export const getOptic = (id: string | undefined, mountSection?: string): OpticCatalogEntry => {
  const key = id ?? 'mini-reflex';
  const entry = OPTIC_CATALOG[key as OpticTypeId];
  if (!entry) {
    throw new Error(`Unknown sight type "${key}".`);
  }
  return mountSection === 'ar' ? (AR_SCOPES[key as OpticTypeId] ?? entry) : entry;
};
