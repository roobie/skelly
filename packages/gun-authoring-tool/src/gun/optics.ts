import type { KeepOut } from '@skelly/engine/assembly/schema.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { RevolvedSolid, Solid, SolidFinish, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { type OpticAperture, OpticApertureSchema } from '@skelly/thing-core/optic-aperture';
import { type Reticle, ReticleSchema } from '@skelly/thing-core/reticle';
import {
  array,
  boolean,
  exactOptional,
  literal,
  number,
  object,
  parse,
  picklist,
  string,
  tuple,
  variant,
} from 'valibot';
import appearance from './appearance.json' with { type: 'json' };
import fixedPrism from './fixedPrism.json' with { type: 'json' };
import type { MountRequirement } from './mounts.ts';
import opticPresentation from './opticPresentation.json' with { type: 'json' };
import reticleContent from './reticles.json' with { type: 'json' };

export const opticRailContactSolids = (solids: readonly Solid[]): readonly Solid[] =>
  solids.filter((solid) => solid.kind === 'box' && solid.id.endsWith('foot'));

/** 1U is 11.5mm; source dimensions are rounded to the model's 0.25u grid. IDs are persisted assembly values. */
export const OPTIC_TYPE_IDS = [
  'mini-reflex',
  'tube-dot',
  'holographic',
  'fixed-prism-4x',
  'lpvo-1-6x',
  'hunting-3-9x',
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
  /** Host feed modes explicitly excluded by the authored mount; geometry is still checked separately. */
  readonly excludedHostFeeds?: readonly string[];
  readonly aperture: OpticAperture;
  readonly reticle: Reticle;
  readonly reticleReference: string;
  readonly reticleSource: string;
  /** Magnification range for export; absent on non-magnifying sights. */
  readonly magnification?: { readonly min: number; readonly max: number };
  readonly ocularX: number;
  /** Diameter of the clear ocular opening, measured at its exported plane. */
  readonly ocularOpeningDiameterU: number;
  readonly eyeReliefU?: number;
  readonly eyeDatumToleranceU?: number;
  readonly solids: readonly Solid[];
  readonly keepOuts: readonly KeepOut[];
  readonly ironCoWitness: boolean;
}

const grid = (value: number): number => Math.round(value / 0.25) * 0.25;

const box = (id: string, min: Vec3, max: Vec3, finish: SolidFinish = { slot: 'metal' }): Solid => {
  const low = min.map(grid);
  const high = max.map(grid);
  return {
    id,
    kind: 'box',
    box: {
      center: low.map((value, axis) => (value + high[axis]!) / 2) as unknown as Vec3,
      half: low.map((value, axis) => (high[axis]! - value) / 2) as unknown as Vec3,
    },
    ...finish,
  };
};

/**
 * Lens glass takes its coating from this finish slot, so a product or an instance can vary it; an optic's default
 * coating is its attachment's default appearance in appearance content.
 */
export const LENS_SLOT = 'lens';

const lensGlass: SolidFinish = { slot: LENS_SLOT };

/** Sides of every round optic body's section, which the lenses seated in it share. */
const OPTIC_BODY_SIDES: number = appearance.opticBodySides;

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

const turned = (id: string, axis: 'x' | 'y' | 'z', origin: Vec3, profile: readonly Vec2[]): RevolvedSolid => ({
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
const SCOPE_WALL_U = 0.125;

const scopeBody = (id: string, centerY: number, outside: readonly Vec2[], wall = SCOPE_WALL_U): Solid => ({
  ...turned(
    id,
    'x',
    [0, centerY, 0],
    [...outside, ...outside.toReversed().map(([axial, radius]): Vec2 => [axial, radius - wall]), outside[0]!],
  ),
  sides: OPTIC_BODY_SIDES,
});

const adsHousing = (solid: Solid): Solid => ({ ...solid, display: { piece: 'optic-ads-housing' } });
const nearFrame = (solid: Solid): Solid => ({ ...solid, display: { piece: 'optic-near-frame' } });

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

/** Thick enough to keep a voxel layer at the sight's detail grain, so the glass survives voxelization. */
const LENS_THICKNESS_U = 0.25;

/**
 * Glass seated flush in a hollow body's open ocular and objective ends, each given as its (axial, outside
 * radius) point. It shares the body's sides, so it fills the opening's inside flats. Listed before the body, so the
 * wall voxels the rim shares paint over the glass.
 */
const scopeLenses = (centerY: number, ocular: Vec2, objective: Vec2): Solid[] =>
  [
    { id: 'ocular-lens', from: ocular[0], to: ocular[0] + LENS_THICKNESS_U, radius: ocular[1] - SCOPE_WALL_U },
    {
      id: 'objective-lens',
      from: objective[0] - LENS_THICKNESS_U,
      to: objective[0],
      radius: objective[1] - SCOPE_WALL_U,
    },
  ].map(({ id, from, to, radius }) => ({
    id,
    kind: 'revolved',
    axis: 'x',
    origin: [0, centerY, 0],
    profile: [
      [from, 0],
      [from, radius],
      [to, radius],
      [to, 0],
    ],
    sides: OPTIC_BODY_SIDES,
    ...lensGlass,
  }));

/** A single-bodied scope with its lenses at both ends of the body's outside profile. */
const lensedScope = (id: string, centerY: number, outside: readonly Vec2[]): Solid[] => [
  ...scopeLenses(centerY, outside[0]!, outside.at(-1)!),
  scopeBody(id, centerY, outside),
];

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
  // The eye sees through another optic's glass, so only its body can block the line.
  allowSlots: [LENS_SLOT],
  ...(ironCoWitness ? { allowFamilies: ['front-sight', 'rail-front-sight'] } : {}),
});

const makeEntry = (
  entry: Omit<OpticCatalogEntry, 'keepOuts' | 'aperture' | 'reticle' | 'reticleReference' | 'reticleSource'> & {
    readonly sightlineStartX: number;
  },
): OpticCatalogEntry => {
  const { sightlineStartX, ...rest } = entry;
  const authored = reticleContent[entry.id];
  return {
    ...rest,
    aperture: parse(OpticApertureSchema, authored.aperture),
    reticle: parse(ReticleSchema, authored.reticle),
    reticleReference: authored.reference,
    reticleSource: authored.source,
    keepOuts: [sightline(sightlineStartX, entry.opticalAxisY, entry.ironCoWitness)],
  };
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

const Vector2 = tuple([number(), number()]);
const Vector3 = tuple([number(), number(), number()]);
const ContentSolid = variant('kind', [
  object({ id: string(), kind: literal('box'), slot: string(), box: object({ center: Vector3, half: Vector3 }) }),
  object({
    id: string(),
    kind: literal('revolved'),
    slot: string(),
    axis: picklist(['x', 'y', 'z']),
    origin: Vector3,
    profile: array(Vector2),
    sides: exactOptional(number()),
  }),
  object({
    id: string(),
    kind: literal('extruded-polygon'),
    slot: string(),
    axis: picklist(['x', 'y', 'z']),
    z: Vector2,
    profile: array(Vector2),
    clip: exactOptional(array(object({ normal: Vector3, offset: number() }))),
    display: exactOptional(object({ bevel: boolean() })),
  }),
]);

const MICRO_HOUSING_DISPLAY = { bevel: false, outline: false, mergeGroup: 'micro-housing' } as const;

/** Manufacturer-class visual envelopes and authored optical metadata. */
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
    ocularOpeningDiameterU: 2.5,
    eyeReliefU: opticPresentation.nonMagnifying.eyeReliefU,
    ironCoWitness: true,
    sightlineStartX: 2.25,
    solids: [
      // The tunnel's two windows, between the floor, walls and hood listed after them.
      box('ocular-lens', [-2.25, 1, -0.75], [-2, 2.25, 0.75], lensGlass),
      box('objective-lens', [2, 1, -0.75], [2.25, 2.25, 0.75], lensGlass),
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
    ocularOpeningDiameterU: 2.5,
    eyeReliefU: opticPresentation.nonMagnifying.eyeReliefU,
    ironCoWitness: true,
    sightlineStartX: 3,
    solids: [
      box('mount-foot', [-2, 0, -0.8], [2, 0.75, 0.8]),
      ...lensedScope('tube-body', 2, [
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
    opticalAxisY: 2.875,
    ocularX: -3.75,
    ocularOpeningDiameterU: 2.75,
    eyeReliefU: opticPresentation.nonMagnifying.eyeReliefU,
    ironCoWitness: true,
    sightlineStartX: 4,
    solids: [
      // The window's rear and front panes, between the side walls and roof listed after them.
      box('ocular-lens', [-3.75, 1.5, -1.5], [-3.5, 4.25, 1.5], lensGlass),
      box(
        'objective-lens',
        [opticPresentation.holographic.hoodFrontX - LENS_THICKNESS_U, 1.5, -1.5],
        [opticPresentation.holographic.hoodFrontX, 4.25, 1.5],
        lensGlass,
      ),
      box('mount-foot', [-2.75, 0, -0.75], [2.75, 0.5, 0.75]),
      box('lower-battery-section', [-3.75, 0.5, -2.25], [opticPresentation.holographic.batteryRearX, 1.5, 2.25]),
      box(
        'forward-battery-cap',
        [opticPresentation.holographic.batteryRearX, 0.5, -2.25],
        [4, opticPresentation.holographic.batteryTopY, 2.25],
      ),
      adsHousing(box('window-left-side', [-3.75, 1.5, -2.25], [opticPresentation.holographic.hoodFrontX, 4.25, -1.5])),
      adsHousing(box('window-right-side', [-3.75, 1.5, 1.5], [opticPresentation.holographic.hoodFrontX, 4.25, 2.25])),
      adsHousing({
        id: 'window-hood-roof',
        kind: 'extruded-polygon',
        axis: 'x',
        z: [-3.75, opticPresentation.holographic.hoodFrontX],
        profile: [
          [4.25, -2.25],
          [5, -1.5],
          [5, 1.5],
          [4.25, 2.25],
        ],
        slot: 'metal',
      }),
      // Later voxel paint separates the retained rim without changing the full hood's occupied volume.
      nearFrame(
        box(
          'near-frame-left',
          [-3.75, 1.5, -1.5 - opticPresentation.holographic.nearFrameThicknessU],
          [-3.75 + opticPresentation.holographic.nearFrameDepthU, 4.25, -1.5],
        ),
      ),
      nearFrame(
        box(
          'near-frame-right',
          [-3.75, 1.5, 1.5],
          [
            -3.75 + opticPresentation.holographic.nearFrameDepthU,
            4.25,
            1.5 + opticPresentation.holographic.nearFrameThicknessU,
          ],
        ),
      ),
      nearFrame(
        box(
          'near-frame-top',
          [-3.75, 4.25, -1.5 - opticPresentation.holographic.nearFrameThicknessU],
          [
            -3.75 + opticPresentation.holographic.nearFrameDepthU,
            4.25 + opticPresentation.holographic.nearFrameThicknessU,
            1.5 + opticPresentation.holographic.nearFrameThicknessU,
          ],
        ),
      ),
      nearFrame(
        box(
          'near-frame-bottom',
          [
            -3.75,
            1.5 - opticPresentation.holographic.nearFrameThicknessU,
            -1.5 - opticPresentation.holographic.nearFrameThicknessU,
          ],
          [
            -3.75 + opticPresentation.holographic.nearFrameDepthU,
            1.5,
            1.5 + opticPresentation.holographic.nearFrameThicknessU,
          ],
        ),
      ),
    ],
  }),
  'fixed-prism-4x': makeEntry({
    id: 'fixed-prism-4x',
    label: 'Fixed 4× prism (TA31 class)',
    magnification: { min: 4, max: 4 },
    reference: fixedPrism.reference,
    source: fixedPrism.source,
    envelopeMm: parse(Vector3, fixedPrism.envelopeMm),
    envelopeU: parse(Vector3, fixedPrism.envelopeU),
    mount: railMount(fixedPrism.mount),
    opticalAxisY: fixedPrism.opticalAxisY,
    excludedHostFeeds: parse(array(picklist(['top', 'box', 'tube', 'cylinder'])), fixedPrism.excludedHostFeeds),
    ocularX: fixedPrism.ocularX,
    ocularOpeningDiameterU: fixedPrism.ocularOpeningDiameterU,
    eyeReliefU: fixedPrism.eyeReliefU,
    eyeDatumToleranceU: fixedPrism.eyeDatumToleranceU,
    ironCoWitness: true,
    sightlineStartX: -fixedPrism.ocularX,
    solids: parse(array(ContentSolid), fixedPrism.solids),
  }),
  'lpvo-1-6x': makeEntry({
    id: 'lpvo-1-6x',
    label: 'Low-power variable optic (Razor Gen II-E class)',
    magnification: { min: 1, max: 6 },
    reference: 'Vortex Razor HD Gen II-E 1–6×24, approximately 257 mm long',
    source: 'https://vortexoptics.com/razor-hd-gen-ii-e-1-6x24.html',
    envelopeMm: [257, 80, 65],
    envelopeU: [opticPresentation.scopes['lpvo-1-6x'].envelopeLengthU, 4.75, 4.5],
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
    ocularOpeningDiameterU: opticPresentation.scopes['lpvo-1-6x'].ocularOpeningDiameterU,
    eyeReliefU: opticPresentation.scopes['lpvo-1-6x'].eyeReliefU,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 11.25,
    solids: [
      ...pairedFeet(1),
      ...lensedScope('tube-with-flared-bells', 2, [
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
  'hunting-3-9x': makeEntry({
    id: 'hunting-3-9x',
    label: 'Hunting scope (3–9×40 class)',
    magnification: { min: 3, max: 9 },
    reference: 'Vortex Crossfire II 3–9×40: L1 11.86 in, H1 1.89 in; turret envelope estimated',
    source: 'https://vortexoptics.com/vortex-crossfire-ii-3-9x40-riflescope.html',
    envelopeMm: [301.244, 48.006, 48.006],
    envelopeU: [opticPresentation.scopes['hunting-3-9x'].envelopeLengthU, 4.75, 4.75],
    mount: railMount({
      contactLengthU: 12,
      contactWidthU: 1.75,
      minimumSlots: 7,
      description: 'paired hunting-scope rings',
      clearanceU: { forward: 1, rearward: 1, lateral: 0.75 },
      ringSpanU: 12,
    }),
    opticalAxisY: 2.25,
    ocularX: -13,
    ocularOpeningDiameterU: opticPresentation.scopes['hunting-3-9x'].ocularOpeningDiameterU,
    eyeReliefU: opticPresentation.scopes['hunting-3-9x'].eyeReliefU,
    eyeDatumToleranceU: 8,
    ironCoWitness: false,
    sightlineStartX: 13.25,
    solids: [
      ...pairedFeet(1.25),
      ...scopeLenses(2.25, [-13, 1.75], [13.25, 2.25]),
      // Separate convex proxies preserve the narrow tube clearance instead of bridging the two bells.
      scopeBody('hunting-ocular', 2.25, [
        [-13, 1.75],
        [-9, 1.75],
        [-8, 1.125],
      ]),
      scopeBody('hunting-tube', 2.25, [
        [-8, 1.125],
        [7, 1.125],
      ]),
      scopeBody('hunting-objective', 2.25, [
        [7, 1.125],
        [9, 2.25],
        [13.25, 2.25],
      ]),
      ringBand('rear-ring-band', -5.5, 2.25, 1.125),
      ringBand('front-ring-band', 5.5, 2.25, 1.125),
      cylinder('elevation-cap', 'y', [0, 0, 0], { span: [3.25, 4.75], radius: 0.75 }),
      cylinder('windage-cap', 'z', [0, 2.25, 0], { span: [1, 2.5], radius: 0.75 }),
    ],
  }),
  'high-mag-5-25x': makeEntry({
    id: 'high-mag-5-25x',
    label: 'High-magnification scope (ATACR 5–25×56 class)',
    magnification: { min: 5, max: 25 },
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
    ocularOpeningDiameterU: 3.25,
    eyeReliefU: 8,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15.75,
    solids: [
      ...pairedFeet(1.75),
      ...lensedScope('tube-with-flared-bells', 3, [
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
    magnification: { min: 3, max: 12 },
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
    ocularOpeningDiameterU: 3.75,
    eyeReliefU: 6.5,
    eyeDatumToleranceU: 9,
    ironCoWitness: false,
    sightlineStartX: 15,
    solids: [
      ...pairedFeet(3),
      ...lensedScope('sensor-tube-with-flared-bells', 4.25, [
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
