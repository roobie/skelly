import { boxFromMinMax, worldSolid } from '../core/geometry.ts';
import { applyDir, applyPoint, cross, dot, extrusionPoint, length, sub, type Vec3 } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import type { ClipPlane, KeepOut, ParamSpec, PartDef, PartFamily, PortDef, Rule, Solid, Vec2 } from '../core/schema.ts';

const SCALE = 1.15;
const MILLIMETRES_PER_U = 11.5;
const GRID_U = 0.25;
const PROFILE_GRID_U = 0.125;
const NOMINAL_FRAME_HEIGHT_U = 9;
const TOLERANCE = 1e-6;
const TRIGGER_GUARD_ID = /^trigger-guard-[0-9]$/;
const TRIGGER_ID = /^curved-trigger-[0-9]$/;

const photoControl = (sourceRow: string, pickedU: number) => ({ sourceRow, pickedU });
const dimension = (sourceRow: string, referenceMm: number, pickedU?: number) => {
  const scaledMm = referenceMm * SCALE;
  const scaledU = scaledMm / MILLIMETRES_PER_U;
  return {
    sourceRow,
    referenceMm,
    scale: SCALE,
    scaledMm,
    scaledU,
    gridU: GRID_U,
    pickedU: pickedU ?? Math.round(scaledU / GRID_U) * GRID_U,
  } as const;
};

/** Reference rows retain their ×1.15/11.5-mm calibration; BR/photo overrides are separate design controls. */
export const REVOLVER_PROPORTIONS = {
  overallLength: dimension('S&W Model 686 Plus Mountain Gun published overall length: 9.75 in', 247.65, 24.75),
  overallHeight: dimension('S&W Model 686 Plus Mountain Gun published overall height: 5.68 in', 144.272, 14.5),
  cylinderDiameter: dimension('686-class top/left photo estimate: 40 mm', 40, 4),
  cylinderLength: dimension('BR 2026-10-02: extend approved 4.00u cylinder by 25% to 5.00u', 39, 5),
  chamberOrbit: dimension('686-class top photo estimate: 13.5 mm', 13.5, 1.25),
  frameWidth: dimension('686-class top photo estimate: 35 mm', 35, 3.5),
  topstrapWidth: photoControl('686 photo-derived narrow roof width; BR-approved 1.75u across frames', 1.75),
  frameHeightEstimate: dimension('686-class side photo preliminary rough estimate, superseded by BR correction', 80, 8),
  frameHeight: photoControl('BR-approved correction from the 686 photo, 2026-10-02', NOMINAL_FRAME_HEIGHT_U),
  frameHeightS: photoControl('686-class S-frame side-profile variant control', 8.75),
  frameHeightL: photoControl('686-class L-frame side-profile variant control', 9.25),
  frameWidthS: photoControl('686-class S-frame top-profile variant control', 3),
  frameWidthL: photoControl('686-class L-frame top-profile variant control', 4),
  barrelAcrossFlats: dimension('686-class side photo estimate: 18 mm', 18, 1.75),
  barrelLengthS: dimension('S&W 686 family 3.00 in barrel', 76.2, 7.5),
  barrelLengthM: dimension('S&W 686 Mountain Gun listed 4.13 in barrel', 104.9, 10.5),
  barrelLengthL: dimension('S&W 686 family 6.00 in barrel', 152.4, 15.25),
  topstrapThickness: dimension('686-class side photo estimate: 6 mm', 6, 0.5),
  gripLength: dimension('686-class side photo estimate: 105 mm visible wood', 105, 10.5),
  gripEnvelopeLengthS: photoControl('686-class S-grip visible wood design control', 9.5),
  gripEnvelopeLengthM: photoControl('686-class M-grip visible wood; approved full envelope', 10.5),
  gripEnvelopeLengthL: photoControl('686-class L-grip visible wood design control', 11.5),
  gripDepth: dimension('686-class top photo estimate: 38 mm', 38, 3.75),
  cylinderGap: dimension('modeling allowance; nominal 686 gap estimate 0.15 mm', 0.15, 0.25),
  frameJointX: photoControl('686 photo-derived horizontal grip-joint datum', -8.75),
  frameJointYS: photoControl('686 photo-derived S-frame grip-joint datum', -5),
  frameJointYM: photoControl('686 photo-derived M-frame grip-joint datum', -5.25),
  frameJointYL: photoControl('686 photo-derived L-frame grip-joint datum', -5.5),
  gripFrameOverlap: photoControl('BR-approved upper wood overlap over rear frame', 3.5),
  gripRake: {
    sourceRow: 'BR-approved bearing-centreline rake; encoded once in the grip control recipe',
    degrees: 22.5,
  },
  gripJointWidth: photoControl('686 photo-derived horizontal grip-joint width', 3),
  gripNeckDepth: photoControl('686 photo-derived grip neck/swell station depth', 1.5),
  gripWaistBottomDepth: photoControl('686 photo-derived grip waist-bottom station depth', 4.5),
  gripButtDepthM: photoControl('BR-approved M-grip free-body depth below joint', 7),
  gripNeckWidth: photoControl('BR-corrected grip front strap; neck lower face continues the waist-front line', 4.5),
  gripWaistWidth: photoControl('686 photo-derived grip waist width', 4.5),
  gripButtWidth: photoControl('686 photo-derived grip butt width', 5.25),
  gripNeckCentreOffset: photoControl('BR-corrected front strap; shared with waist-top control to remove flare', -0.625),
  gripWaistTopCentreOffset: photoControl('686 photo-derived waist-top centre offset from rake axis', -0.625),
  gripWaistBottomCentreOffset: photoControl('686 photo-derived waist-bottom centre offset from rake axis', -0.375),
  gripButtCentreOffset: photoControl('686 photo-derived butt centre offset from rake axis', 0),
  gripRoundButtChamfer: photoControl('686-class rounded-butt silhouette clipping control', 0.5),
  topstrapRearOverhang: photoControl('686-class strap extension behind the cylinder rear face', 1),
  frontBossLength: photoControl('686-class barrel-boss axial length', 1.5),
  frameFloorRearInset: photoControl('686-class frame-floor rear inset from the cylinder rear', 0.25),
  frameFloorYTop: photoControl('686 photo-derived floor upper datum', -3.5),
  frameFloorYBottom: photoControl('686 photo-derived floor lower datum', -4.5),
  topstrapBottomY: photoControl('686 photo-derived lower topstrap datum', 0.75),
  threadBossOuterAcrossFlats: photoControl('686-class octagonal barrel boss outer across-flats control', 2.5),
  threadBossInnerAcrossFlats: photoControl('686-class open barrel boss inner across-flats control', 2),
  frontFootDepth: photoControl('686-class ejector-tunnel lower foot extent', 3.5),
  frontFootTop: photoControl('686-class ejector-tunnel foot top', -1.5),
  frontFootBottom: photoControl('686-class ejector-tunnel foot bottom', -3.5),
  ejectorChannelHalfWidth: photoControl('686-class open ejector-rod channel half-width', 0.25),
  guardHalfDepth: photoControl('686 photo-derived joined trigger-bow half-depth', 0.375),
  gripCoreDepthRatio: photoControl('686-class grip-core fraction of total wood depth', 2 / 3),
} as const;

const C = REVOLVER_PROPORTIONS;
const chamberCount = 6;
const cylinderRadius = C.cylinderDiameter.pickedU / 2;
const cylinderLength = C.cylinderLength.pickedU;
const orbit = C.chamberOrbit.pickedU;
const gap = C.cylinderGap.pickedU;
const boreX = 0;
const cylinderFrontX = boreX - gap;
const cylinderRearX = cylinderFrontX - cylinderLength;
const cylinderCentreX = (cylinderFrontX + cylinderRearX) / 2;
const cylinderCentreY = -orbit;
const topstrapBottomY = C.topstrapBottomY.pickedU;
const topstrapTopY = topstrapBottomY + C.topstrapThickness.pickedU;
const frameFloorFrontX = C.frontBossLength.pickedU;
const strapRearX = cylinderRearX - C.topstrapRearOverhang.pickedU;
const floorRearX = cylinderRearX - C.frameFloorRearInset.pickedU;
const frameFrontX = frameFloorFrontX;
const frameJointX = C.frameJointX.pickedU;
const profileHalfDepth = C.gripDepth.pickedU / 2;
const gripCoreHalfDepth = (C.gripDepth.pickedU * C.gripCoreDepthRatio.pickedU) / 2;
const GRIP_RAKE_DEGREES = C.gripRake.degrees;
export const REVOLVER_GRIP_RAKE_DEGREES = GRIP_RAKE_DEGREES;
const size: ParamSpec = { values: ['S', 'M', 'L'], default: 'M' };
const choice = (...values: string[]): ParamSpec => ({ values, default: values[0]! });
const frameVariants = {
  S: { width: C.frameWidthS.pickedU, height: C.frameHeightS.pickedU, jointY: C.frameJointYS.pickedU },
  M: { width: C.frameWidth.pickedU, height: C.frameHeight.pickedU, jointY: C.frameJointYM.pickedU },
  L: { width: C.frameWidthL.pickedU, height: C.frameHeightL.pickedU, jointY: C.frameJointYL.pickedU },
} as const;
const gripEnvelopeLengths = {
  S: C.gripEnvelopeLengthS.pickedU,
  M: C.gripEnvelopeLengthM.pickedU,
  L: C.gripEnvelopeLengthL.pickedU,
} as const;
const barrelLengths = {
  S: C.barrelLengthS.pickedU,
  M: C.barrelLengthM.pickedU,
  L: C.barrelLengthL.pickedU,
} as const;
const chamberSize: ParamSpec = { values: ['S', 'M'], default: 'M' };

type Profile = readonly Vec2[];
type ExtrusionAxis = 'x' | 'y' | 'z';
type Extrusion = readonly [number, number];

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const twiceArea = (profile: Profile): number =>
  profile.reduce((sum, point, index) => {
    const next = profile[(index + 1) % profile.length]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
const ccw = (profile: Profile): Profile => (twiceArea(profile) >= 0 ? profile : [...profile].reverse());
// biome-ignore lint/complexity/useMaxParams: Keep this local prism constructor aligned with its positional geometry rows.
const polySolid = (
  id: string,
  profile: Profile,
  along: Extrusion,
  axis: ExtrusionAxis,
  mergeGroup?: string,
  clip?: readonly ClipPlane[],
  slot?: string,
): Solid => ({
  id,
  kind: 'extruded-polygon',
  profile: ccw(profile),
  axis,
  z: along,
  ...(slot ? { slot } : {}),
  ...(mergeGroup ? { display: { outline: false, bevel: false, mergeGroup } } : {}),
  ...(clip ? { clip } : {}),
});

const keepOut = (id: string, min: Vec3, max: Vec3, allowPort?: string): KeepOut => {
  const bounds = boxFromMinMax(min, max);
  return {
    id,
    kind: id,
    box: { center: bounds.center, half: bounds.half },
    ...(allowPort ? { allowPort } : {}),
  };
};

const octagonAcrossFlats = (acrossFlats: number, center: readonly [number, number] = [0, 0]): Profile => {
  const halfFlat = acrossFlats / 2;
  const inset = halfFlat * (Math.SQRT2 - 1);
  const outline: readonly Vec2[] = [
    [halfFlat, inset],
    [inset, halfFlat],
    [-inset, halfFlat],
    [-halfFlat, inset],
    [-halfFlat, -inset],
    [-inset, -halfFlat],
    [inset, -halfFlat],
    [halfFlat, -inset],
  ];
  return outline.map(([x, y]) => [x + center[0], y + center[1]] as const);
};

const octagonRadius = (radius: number, centre: readonly [number, number] = [0, 0]): Profile =>
  Array.from({ length: 8 }, (_, index) => {
    const angle = Math.PI / 8 + (Math.PI / 4) * index;
    return [centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)] as const;
  });

const frameSide = (frameSize: string) => frameVariants[frameSize as keyof typeof frameVariants] ?? frameVariants.M;
const gripLengthFor = (lengthName: string): number =>
  gripEnvelopeLengths[lengthName as keyof typeof gripEnvelopeLengths] ?? gripEnvelopeLengths.M;

interface GripStation {
  readonly depth: number;
  readonly width: number;
  readonly centreOffset: number;
  readonly left: Vec2;
  readonly right: Vec2;
}

const gripStations = (
  lengthName: string,
): {
  readonly joint: GripStation;
  readonly neck: GripStation;
  readonly waistTop: GripStation;
  readonly waistBottom: GripStation;
  readonly butt: GripStation;
} => {
  const fullLength = gripLengthFor(lengthName);
  const freeLength = fullLength - C.gripFrameOverlap.pickedU;
  const scale = freeLength / C.gripButtDepthM.pickedU;
  const rake = (GRIP_RAKE_DEGREES * Math.PI) / 180;
  const station = (nominalDepth: number, width: number, centreOffset: number): GripStation => {
    const depth = roundTo(nominalDepth * scale, PROFILE_GRID_U);
    const roundedAxisX = -roundTo(depth * Math.tan(rake), PROFILE_GRID_U);
    const axisX = roundedAxisX === 0 ? 0 : roundedAxisX;
    const centre = axisX + centreOffset;
    const stationY = depth === 0 ? 0 : -depth;
    const left: Vec2 = [centre - width / 2, stationY];
    const right: Vec2 = [centre + width / 2, stationY];
    return { depth, width, centreOffset, left, right };
  };
  const joint = station(0, C.gripJointWidth.pickedU, 0);
  const neck = station(C.gripNeckDepth.pickedU, C.gripNeckWidth.pickedU, C.gripNeckCentreOffset.pickedU);
  const waistTop = station(C.gripNeckDepth.pickedU, C.gripWaistWidth.pickedU, C.gripWaistTopCentreOffset.pickedU);
  const waistBottom = station(
    C.gripWaistBottomDepth.pickedU,
    C.gripWaistWidth.pickedU,
    C.gripWaistBottomCentreOffset.pickedU,
  );
  const butt = station(C.gripButtDepthM.pickedU, C.gripButtWidth.pickedU, C.gripButtCentreOffset.pickedU);
  return { joint, neck, waistTop, waistBottom, butt };
};
const barrelLengthFor = (lengthName: string): number =>
  barrelLengths[lengthName as keyof typeof barrelLengths] ?? barrelLengths.M;
const guardOuter: Profile = [
  [-0.75, -5.25],
  [-1.5, -4.5],
  [-4.5, -4.5],
  [-5.25, -5.25],
  [-5.5, -6.5],
  [-5, -7.25],
  [-4.25, -7.75],
  [-2, -7.75],
  [-1, -7],
  [-0.75, -6.25],
];
const guardInner: Profile = [
  [-1, -5.375],
  [-1.625, -4.75],
  [-4.375, -4.75],
  [-5, -5.375],
  [-5.25, -6.5],
  [-4.75, -7.125],
  [-4.125, -7.5],
  [-2.125, -7.5],
  [-1.25, -6.875],
  [-1, -6.25],
];
const guardVariantProfile = (profile: Profile, frameHeight: number): Profile => {
  const guardBottomY = topstrapTopY - frameHeight;
  const nominalGuardBottomY = topstrapTopY - NOMINAL_FRAME_HEIGHT_U;
  const lowerDelta = guardBottomY - nominalGuardBottomY;
  return profile.map(([x, y]) => [x, y <= -6.25 ? y + lowerDelta : y] as const);
};

const triggerProfiles: readonly Profile[] = [
  [
    [-3, -4.5],
    [-3.5, -4.5],
    [-4, -5.25],
    [-3.5, -5.5],
  ],
  [
    [-4, -5.25],
    [-3.5, -5.5],
    [-3.75, -6.25],
    [-4.25, -6.25],
  ],
  [
    [-4.25, -6.25],
    [-3.75, -6.25],
    [-3.25, -6.75],
    [-3.5, -7],
  ],
  [
    [-3.5, -7],
    [-3.25, -6.75],
    [-2.75, -6.75],
    [-2.75, -7],
  ],
];

const triggerVariantProfile = (profile: Profile, frameHeight: number): Profile => {
  const guardBottomY = topstrapTopY - frameHeight;
  const nominalGuardBottomY = topstrapTopY - NOMINAL_FRAME_HEIGHT_U;
  const lowerDelta = guardBottomY - nominalGuardBottomY;
  return profile.map(([x, y]) => [x, y <= -6.25 ? y + lowerDelta : y] as const);
};

const octagonalBossRing = (): Solid[] => {
  const outer = octagonAcrossFlats(C.threadBossOuterAcrossFlats.pickedU);
  const inner = octagonAcrossFlats(C.threadBossInnerAcrossFlats.pickedU);
  const solids: Solid[] = [];
  for (let index = 0; index < 8; index += 1) {
    const next = (index + 1) % 8;
    if (index === 3) {
      continue;
    }
    solids.push(
      polySolid(
        `thread-boss-${index}`,
        [outer[index]!, outer[next]!, inner[next]!, inner[index]!],
        [0, C.frontBossLength.pickedU],
        'x',
        'revolver-frame',
      ),
    );
  }
  const bottomOuter = C.threadBossOuterAcrossFlats.pickedU / 2;
  const bottomInner = C.threadBossInnerAcrossFlats.pickedU / 2;
  const outerInset = bottomOuter * (Math.SQRT2 - 1);
  const innerInset = bottomInner * (Math.SQRT2 - 1);
  const channelHalf = C.ejectorChannelHalfWidth.pickedU;
  solids.push(
    polySolid(
      'thread-boss-bottom-far',
      [
        [-bottomOuter, -outerInset],
        [-bottomOuter, -channelHalf],
        [-bottomInner, -channelHalf],
        [-bottomInner, -innerInset],
      ],
      [0, C.frontBossLength.pickedU],
      'x',
      'revolver-frame',
    ),
    polySolid(
      'thread-boss-bottom-near',
      [
        [-bottomOuter, channelHalf],
        [-bottomOuter, outerInset],
        [-bottomInner, innerInset],
        [-bottomInner, channelHalf],
      ],
      [0, C.frontBossLength.pickedU],
      'x',
      'revolver-frame',
    ),
  );
  return solids;
};

const guardBowSolids = (frameHeight: number): Solid[] => {
  const outer = guardVariantProfile(guardOuter, frameHeight);
  const inner = guardVariantProfile(guardInner, frameHeight);
  return outer.map((point, index) => {
    const next = (index + 1) % outer.length;
    return polySolid(
      `trigger-guard-${index}`,
      [point, outer[next]!, inner[next]!, inner[index]!],
      [-C.guardHalfDepth.pickedU, C.guardHalfDepth.pickedU],
      'z',
      'revolver-frame',
    );
  });
};

const rearSightSolids = (): Solid[] => {
  const sight: Profile = [
    [-6.5, 1.25],
    [-5.5, 1.25],
    [-5.5, 1.5],
    [-6, 1.75],
    [-6.5, 1.75],
  ];
  return [
    polySolid('rear-sight-far', sight, [-0.5, -0.125], 'z', 'revolver-frame'),
    polySolid('rear-sight-near', sight, [0.125, 0.5], 'z', 'revolver-frame'),
  ];
};

const hammerSolids = (): Solid[] => {
  const body: Profile = [
    [-6.25, 0.25],
    [-6.25, -1.5],
    [-7, -1.5],
    [-7.5, -0.75],
    [-7.25, -0.25],
  ];
  const spur: Profile = [
    [-7.25, -0.5],
    [-8.5, 0.25],
    [-8.75, 0],
    [-7.5, -1],
  ];
  return [
    polySolid('exposed-hammer-body', body, [-0.375, 0.375], 'z', 'revolver-hammer'),
    polySolid('exposed-hammer-spur', spur, [-0.375, 0.375], 'z', 'revolver-hammer'),
  ];
};

const triggerSolids = (frameHeight: number): Solid[] =>
  triggerProfiles.map((profile, index) =>
    polySolid(
      `curved-trigger-${index}`,
      triggerVariantProfile(profile, frameHeight),
      [-0.25, 0.25],
      'z',
      'revolver-trigger',
    ),
  );

const rearFrameBridgeSolid = (jointY: number, frameHeight: number, gripLength: string): Solid => {
  const guard = guardVariantProfile(guardOuter, frameHeight);
  const gripFront = gripStations(gripLength).neck.right;
  const profile: Profile = [
    [floorRearX, -3.75],
    [frameJointX + C.gripJointWidth.pickedU / 2, jointY],
    [frameJointX + gripFront[0], jointY + gripFront[1]],
    guard[4]!,
    guard[3]!,
  ];
  return polySolid('rear-frame-bridge', ccw(profile), [-1.25, 1.25], 'z', 'revolver-frame');
};

const revolverFrame: PartFamily = {
  name: 'revolver-frame',
  params: {
    bore: chamberSize,
    frameSize: choice('S', 'M', 'L'),
    gripLength: { ...size, from: [{ port: 'grip-frame', param: 'length' }] },
    butt: choice('round', 'square'),
  },
  build(params): PartDef {
    const frame = frameSide(params.frameSize ?? 'M');
    const { jointY } = frame;
    const strapHalfDepth = C.topstrapWidth.pickedU / 2;
    const shieldHalfDepth = frame.width / 2;
    const solids: Solid[] = [
      polySolid(
        'topstrap',
        [
          [strapRearX, topstrapBottomY],
          [frameFrontX, topstrapBottomY],
          [frameFrontX, topstrapTopY],
          [strapRearX, topstrapTopY],
        ],
        [-strapHalfDepth, strapHalfDepth],
        'z',
        'revolver-frame',
      ),
      polySolid(
        'frame-floor',
        [
          [floorRearX, C.frameFloorYBottom.pickedU],
          [frameFrontX, C.frameFloorYBottom.pickedU],
          [frameFrontX, C.frameFloorYTop.pickedU],
          [floorRearX, C.frameFloorYTop.pickedU],
        ],
        [-strapHalfDepth, strapHalfDepth],
        'z',
        'revolver-frame',
      ),
      polySolid(
        'rear-shoulder',
        [
          [floorRearX, topstrapBottomY],
          [strapRearX, topstrapTopY],
          [floorRearX - 1.75, -0.5],
          [floorRearX, -0.5],
        ],
        [-1.25, 1.25],
        'z',
        'revolver-frame',
      ),
      polySolid(
        'rear-ramp',
        [
          [floorRearX, -0.5],
          [floorRearX - 1.75, -0.5],
          [floorRearX - 3.75, -1.75],
          [floorRearX, -1.75],
        ],
        [-1.25, 1.25],
        'z',
        'revolver-frame',
      ),
      polySolid(
        'rear-block',
        [
          [floorRearX, -1.75],
          [floorRearX - 3.75, -1.75],
          [floorRearX - 4.25, -3.75],
          [floorRearX, -3.75],
        ],
        [-1.25, 1.25],
        'z',
        'revolver-frame',
      ),
      polySolid(
        'rear-joint',
        [
          [floorRearX, -3.75],
          [floorRearX - 4.25, -3.75],
          [floorRearX - 4.75, jointY],
          [frameJointX + C.gripJointWidth.pickedU / 2, jointY],
        ],
        [-1.25, 1.25],
        'z',
        'revolver-frame',
      ),
      polySolid(
        'recoil-shield',
        [
          [0.75, 0],
          [0, 1.25],
          [-1.25, shieldHalfDepth],
          [-2.5, 1.25],
          [-3.25, 0],
          [-2.5, -1.25],
          [-1.25, -shieldHalfDepth],
          [0, -1.25],
        ],
        [cylinderRearX - 0.25, cylinderRearX],
        'x',
        'revolver-frame',
      ),
      polySolid(
        'front-foot',
        [
          [C.frontFootBottom.pickedU, -0.625],
          [C.frontFootTop.pickedU, -0.625],
          [C.frontFootTop.pickedU, 0.625],
          [C.frontFootBottom.pickedU, 0.625],
        ],
        [0, frameFrontX],
        'x',
        'revolver-frame',
      ),
      polySolid(
        'front-channel-far',
        [
          [C.frontFootTop.pickedU, -0.625],
          [-1, -0.625],
          [-1, -C.ejectorChannelHalfWidth.pickedU],
          [C.frontFootTop.pickedU, -C.ejectorChannelHalfWidth.pickedU],
        ],
        [0, frameFrontX],
        'x',
        'revolver-frame',
      ),
      polySolid(
        'front-channel-near',
        [
          [C.frontFootTop.pickedU, C.ejectorChannelHalfWidth.pickedU],
          [-1, C.ejectorChannelHalfWidth.pickedU],
          [-1, 0.625],
          [C.frontFootTop.pickedU, 0.625],
        ],
        [0, frameFrontX],
        'x',
        'revolver-frame',
      ),
      ...octagonalBossRing(),
      ...guardBowSolids(frame.height),
      ...rearSightSolids(),
      ...hammerSolids(),
      ...triggerSolids(frame.height),
      rearFrameBridgeSolid(jointY, frame.height, params.gripLength ?? 'M'),
    ];
    const barrelPort: PortDef = {
      id: 'barrel',
      mount: 'barrel',
      gender: 'female',
      size: params.bore ?? 'M',
      pos: [boreX, 0, 0],
      normal: [1, 0, 0],
      up: [0, 1, 0],
      required: true,
    };
    const cylinderPort: PortDef = {
      id: 'cylinder',
      mount: 'revolver-cylinder',
      gender: 'female',
      pos: [cylinderCentreX, cylinderCentreY, 0],
      normal: [1, 0, 0],
      up: [0, 1, 0],
      required: true,
    };
    const gripPort: PortDef = {
      id: 'grip-frame',
      mount: 'revolver-grip',
      gender: 'female',
      pos: [frameJointX, jointY, 0],
      normal: [0, -1, 0],
      up: [1, 0, 0],
      required: true,
    };
    return {
      family: 'revolver-frame',
      solids,
      ports: [
        barrelPort,
        cylinderPort,
        gripPort,
        {
          id: 'hammer',
          mount: 'revolver-hammer',
          gender: 'female',
          pos: [-7.25, 0.25, 0],
          normal: [0, 1, 0],
          up: [1, 0, 0],
        },
        {
          id: 'trigger-guard',
          mount: 'revolver-trigger-guard',
          gender: 'female',
          pos: [-3.5, -4.5, 0],
          normal: [0, -1, 0],
          up: [1, 0, 0],
        },
      ],
      keepOuts: [
        keepOut('cylinder-swing', [cylinderRearX, -3.5, -4], [cylinderFrontX, 1, -1.5], 'cylinder'),
        keepOut('cylinder-gap', [cylinderFrontX, -1, -1], [boreX, 1, 1]),
        keepOut('hammer-travel', [-8.75, -1.5, -1], [-6.25, 1.25, 1]),
      ],
      axes: [],
    };
  },
};

const fluteFacetAngle = (chamberAngle: number): number => {
  const candidates = Array.from({ length: 8 }, (_, index) => index * (Math.PI / 4));
  return candidates.reduce((best, angle) => {
    const distance = (value: number) =>
      Math.abs(Math.atan2(Math.sin(value - chamberAngle), Math.cos(value - chamberAngle)));
    return distance(angle) < distance(best) ? angle : best;
  }, candidates[0]!);
};

const cylinderFlute = (index: number): Solid => {
  const chamberAngle = (2 * Math.PI * index) / chamberCount;
  const angle = fluteFacetAngle(chamberAngle);
  const normal: Vec2 = [Math.cos(angle), Math.sin(angle)];
  const tangent: Vec2 = [-normal[1], normal[0]];
  const apothem = cylinderRadius * Math.cos(Math.PI / 8);
  const centre: Vec2 = [apothem * normal[0], apothem * normal[1]];
  const halfWidth = 0.1;
  const inset = -0.01;
  const outset = 0.01;
  const point = (side: number, depth: number): Vec2 => [
    centre[0] + tangent[0] * side + normal[0] * depth,
    centre[1] + tangent[1] * side + normal[1] * depth,
  ];
  return polySolid(
    `cylinder-flute-${index}`,
    [point(-halfWidth, inset), point(halfWidth, inset), point(halfWidth, outset), point(-halfWidth, outset)],
    [-2.25, 2.25],
    'x',
    'revolver-cylinder',
    undefined,
    'metal',
  );
};

const chamberMarker = (index: number, phase: number): Solid => {
  const angle = phase + (2 * Math.PI * index) / chamberCount;
  const centre: Vec2 = [orbit * Math.cos(angle), orbit * Math.sin(angle)];
  return polySolid(
    `chamber-${index}`,
    octagonRadius(0.17, centre),
    [-2.515, -2.5],
    'x',
    'revolver-cylinder',
    undefined,
    'metal',
  );
};

const chamberPhase = (params: Readonly<Record<string, string>>): number => {
  const index = Number(params.chamberIndex ?? '0');
  return (2 * Math.PI * index) / chamberCount;
};

const revolverCylinder: PartFamily = {
  name: 'revolver-cylinder',
  params: {
    chamberCount: { values: ['6'], default: '6' },
    chamberIndex: { values: ['0', '1', '2', '3', '4', '5'], default: '0', fault: ['1', '2', '3', '4', '5'] },
  },
  build(params): PartDef {
    const phase = chamberPhase(params);
    const drum = polySolid(
      'drum',
      octagonRadius(cylinderRadius),
      [-cylinderLength / 2, cylinderLength / 2],
      'x',
      'revolver-cylinder',
      undefined,
      'metal',
    );
    const craneProfile: Profile = [
      [-0.75 - cylinderCentreX, -3.75 - cylinderCentreY],
      [0.75 - cylinderCentreX, -3.75 - cylinderCentreY],
      [0.75 - cylinderCentreX, -3 - cylinderCentreY],
      [-0.25 - cylinderCentreX, -1.75 - cylinderCentreY],
      [-0.75 - cylinderCentreX, -1.75 - cylinderCentreY],
    ];
    const crane = polySolid('crane-yoke', craneProfile, [-0.5, 0.5], 'z', 'revolver-cylinder', undefined, 'metal');
    const rod = polySolid(
      'ejector-rod',
      octagonAcrossFlats(0.25, [-1.25 - cylinderCentreY, 0]),
      [-0.25 - cylinderCentreX, 5.5 - cylinderCentreX],
      'x',
      'revolver-cylinder',
      undefined,
      'metal',
    );
    const solids = [drum, crane, rod];
    const displaySolids = [
      ...solids,
      ...Array.from({ length: chamberCount }, (_, index) => cylinderFlute(index)),
      ...Array.from({ length: chamberCount }, (_, index) => chamberMarker(index, phase)),
    ];
    const barrelDatumLocalX = cylinderFrontX - cylinderCentreX;
    const chamberCentre: Vec3 = [0, orbit * Math.cos(phase), orbit * Math.sin(phase)];
    return {
      family: 'revolver-cylinder',
      solids,
      displaySolids,
      ports: [
        {
          id: 'frame',
          mount: 'revolver-cylinder',
          gender: 'male',
          pos: [0, 0, 0],
          normal: [-1, 0, 0],
          up: [0, 1, 0],
          required: true,
        },
        {
          id: 'barrel',
          mount: 'revolver-cylinder',
          gender: 'male',
          pos: [barrelDatumLocalX, -cylinderCentreY, 0],
          normal: [1, 0, 0],
          up: [0, 1, 0],
        },
      ],
      keepOuts: [],
      axes: [
        { kind: 'bore', origin: chamberCentre, dir: [1, 0, 0] },
        { kind: 'revolver-cylinder', origin: [0, 0, 0], dir: [1, 0, 0] },
      ],
    };
  },
};

const revolverBarrelProfile = (acrossFlats: number): Profile => octagonAcrossFlats(acrossFlats);
const ventedRibPosts = (barrelLength: number): Solid[] => {
  const postIntervals: Array<readonly [number, number]> = [];
  const start = 0.5;
  const end = barrelLength;
  for (let x = start; x <= end - 1 + TOLERANCE; x += 2) {
    postIntervals.push([x, x + 0.5]);
  }
  postIntervals.push([end - 0.5, end]);
  return postIntervals.map(([x0, x1], index) =>
    polySolid(
      `vented-rib-post-${index}`,
      [
        [-0.375, 0.875],
        [0.375, 0.875],
        [0.375, 1.125],
        [-0.375, 1.125],
      ],
      [x0, x1],
      'x',
      'revolver-barrel',
    ),
  );
};

const underlugClip: readonly ClipPlane[] = [
  { normal: [0, -1 / Math.SQRT2, 1 / Math.SQRT2], offset: 2.75 / Math.SQRT2 },
  { normal: [0, -1 / Math.SQRT2, -1 / Math.SQRT2], offset: 2.75 / Math.SQRT2 },
];

const revolverBarrel: PartFamily = {
  name: 'revolver-barrel',
  params: {
    bore: { ...chamberSize, from: [{ port: 'frame', param: 'bore' }] },
    length: size,
    style: choice('classic', 'vented'),
  },
  build(params): PartDef {
    const len = barrelLengthFor(params.length ?? 'M');
    const bodyAF = C.barrelAcrossFlats.pickedU;
    const forcingAF = C.threadBossInnerAcrossFlats.pickedU;
    const style = params.style ?? 'classic';
    const barrel = polySolid(
      'barrel-octagon',
      revolverBarrelProfile(bodyAF),
      [0.5, len],
      'x',
      'revolver-barrel',
      undefined,
      'metal',
    );
    const forcingCone = polySolid(
      'forcing-cone',
      revolverBarrelProfile(forcingAF),
      [0, 0.5],
      'x',
      'revolver-barrel',
      undefined,
      'metal',
    );
    const solids: Solid[] = [forcingCone, barrel];
    if (style === 'classic') {
      solids.push(
        polySolid(
          'top-rib',
          [
            [0.5, 0.75],
            [len, 0.75],
            [len, 1.25],
            [0.5, 1.25],
          ],
          [-0.375, 0.375],
          'z',
          'revolver-barrel',
          undefined,
          'metal',
        ),
      );
    } else {
      solids.push(
        polySolid(
          'vented-rib-platform',
          [
            [0.5, 0.75],
            [len, 0.75],
            [len, 0.875],
            [0.5, 0.875],
          ],
          [-0.375, 0.375],
          'z',
          'revolver-barrel',
          undefined,
          'metal',
        ),
        polySolid(
          'vented-rib-cap',
          [
            [0.5, 1.125],
            [len, 1.125],
            [len, 1.25],
            [0.5, 1.25],
          ],
          [-0.375, 0.375],
          'z',
          'revolver-barrel',
          undefined,
          'metal',
        ),
        ...ventedRibPosts(len),
      );
    }
    solids.push(
      polySolid(
        'underlug-roof',
        [
          [-1, -0.625],
          [-0.75, -0.625],
          [-0.75, 0.625],
          [-1, 0.625],
        ],
        [1, len - 0.5],
        'x',
        'revolver-barrel',
        undefined,
        'metal',
      ),
      polySolid(
        'underlug-floor',
        [
          [-2.25, -0.625],
          [-1.5, -0.625],
          [-1.5, 0.625],
          [-2.25, 0.625],
        ],
        [1, len - 0.5],
        'x',
        'revolver-barrel',
        underlugClip,
        'metal',
      ),
      polySolid(
        'underlug-far-wall',
        [
          [-1.5, -0.625],
          [-1, -0.625],
          [-1, -0.25],
          [-1.5, -0.25],
        ],
        [1, len - 0.5],
        'x',
        'revolver-barrel',
        underlugClip,
        'metal',
      ),
      polySolid(
        'underlug-near-wall',
        [
          [-1.5, 0.25],
          [-1, 0.25],
          [-1, 0.625],
          [-1.5, 0.625],
        ],
        [1, len - 0.5],
        'x',
        'revolver-barrel',
        underlugClip,
        'metal',
      ),
      polySolid(
        'underlug-nose-cap',
        [
          [len - 0.5, -2.25],
          [len, -1.75],
          [len, -0.75],
          [len - 0.5, -0.75],
        ],
        [-0.625, 0.625],
        'z',
        'revolver-barrel',
        underlugClip,
        'metal',
      ),
      polySolid(
        'front-sight',
        [
          [len - 2, 1.25],
          [len - 0.25, 1.25],
          [len - 0.25, 2],
          [len - 0.5, 2.25],
          [len - 1.75, 2.25],
        ],
        [-0.25, 0.25],
        'z',
        'revolver-barrel',
        undefined,
        'metal',
      ),
    );
    const rodLength = 5.5;
    return {
      family: 'revolver-barrel',
      solids,
      ports: [
        {
          id: 'frame',
          mount: 'barrel',
          gender: 'male',
          size: params.bore ?? 'M',
          pos: [0, 0, 0],
          normal: [-1, 0, 0],
          up: [0, 1, 0],
          required: true,
        },
        {
          id: 'cylinder',
          mount: 'revolver-cylinder',
          gender: 'female',
          pos: [-gap, 0, 0],
          normal: [-1, 0, 0],
          up: [0, 1, 0],
        },
        { id: 'muzzle', mount: 'muzzle', gender: 'female', pos: [len, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] },
      ],
      keepOuts: [
        keepOut('muzzle', [len, -1, -1], [len + 30, 1, 1]),
        keepOut(
          'ejector-rod-channel',
          [1, -1.5, -C.ejectorChannelHalfWidth.pickedU],
          [rodLength, -1, C.ejectorChannelHalfWidth.pickedU],
          'cylinder',
        ),
      ],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: [1, 0, 0] }],
    };
  },
};

const gripBandProfiles = (lengthName: string, buttStyle: string) => {
  const { joint, neck, waistTop, waistBottom, butt } = gripStations(lengthName);
  const neckProfile: Profile = [joint.left, joint.right, neck.right, neck.left];
  const bodyProfile: Profile = [neck.left, waistTop.right, waistBottom.right, waistBottom.left];
  const squareButt: Profile = [waistBottom.left, waistBottom.right, butt.right, butt.left];
  const bevel = C.gripRoundButtChamfer.pickedU;
  const roundButt: Profile = [
    waistBottom.left,
    waistBottom.right,
    [butt.right[0], -(butt.depth - bevel)],
    [butt.right[0] - bevel, -butt.depth],
    [butt.left[0] + bevel, -butt.depth],
    [butt.left[0], -(butt.depth - bevel)],
  ];
  return {
    neck: ccw(neckProfile),
    body: ccw(bodyProfile),
    butt: ccw(buttStyle === 'square' ? squareButt : roundButt),
    cover: ccw([
      [-0.75, C.gripFrameOverlap.pickedU],
      [0.25, C.gripFrameOverlap.pickedU],
      [1.5, 0],
      [-1.5, 0],
    ]),
  };
};

const gripSidePanels = (id: string, profile: Profile): Solid[] => [
  polySolid(
    `${id}-far`,
    profile,
    [-profileHalfDepth, -gripCoreHalfDepth],
    'z',
    'revolver-grip',
    undefined,
    'furniture',
  ),
  polySolid(`${id}-near`, profile, [gripCoreHalfDepth, profileHalfDepth], 'z', 'revolver-grip', undefined, 'furniture'),
];

const revolverGrip: PartFamily = {
  name: 'revolver-grip',
  params: {
    length: size,
    butt: { ...choice('round', 'square'), from: [{ port: 'frame', param: 'butt' }] },
  },
  build(params): PartDef {
    const profiles = gripBandProfiles(params.length ?? 'M', params.butt ?? 'round');
    const core = [
      polySolid(
        'grip-core-neck',
        profiles.neck,
        [-gripCoreHalfDepth, gripCoreHalfDepth],
        'z',
        'revolver-grip',
        undefined,
        'furniture',
      ),
      polySolid(
        'grip-core',
        profiles.body,
        [-gripCoreHalfDepth, gripCoreHalfDepth],
        'z',
        'revolver-grip',
        undefined,
        'furniture',
      ),
      polySolid(
        'grip-core-butt',
        profiles.butt,
        [-gripCoreHalfDepth, gripCoreHalfDepth],
        'z',
        'revolver-grip',
        undefined,
        'furniture',
      ),
    ];
    const panels = [
      ...gripSidePanels('grip-panel-neck', profiles.neck),
      ...gripSidePanels('grip-panel-body', profiles.body),
      ...gripSidePanels('grip-panel-butt', profiles.butt),
      polySolid(
        'grip-cover-far',
        profiles.cover,
        [-profileHalfDepth, -gripCoreHalfDepth],
        'z',
        'revolver-grip',
        undefined,
        'furniture',
      ),
      polySolid(
        'grip-cover-near',
        profiles.cover,
        [gripCoreHalfDepth, profileHalfDepth],
        'z',
        'revolver-grip',
        undefined,
        'furniture',
      ),
    ];
    return {
      family: 'revolver-grip',
      slot: 'furniture',
      solids: [...core, ...panels],
      ports: [
        {
          id: 'frame-joint',
          mount: 'revolver-grip',
          gender: 'male',
          pos: [0, 0, 0],
          normal: [0, 1, 0],
          up: [1, 0, 0],
          required: true,
        },
      ],
      keepOuts: [],
      axes: [],
      tags: ['firing-grip'],
    };
  },
};

const revolverParts = (resolved: Parameters<NonNullable<Rule['check']>>[0]) =>
  [...resolved.defs].filter(([part, def]) => resolved.placed.has(part) && def.family.startsWith('revolver-'));

const solidVertices = (resolved: Parameters<NonNullable<Rule['check']>>[0], part: string, solid: Solid): Vec3[] => {
  const world = worldSolid(resolved.placed.get(part)!, solid);
  return 'vertices' in world ? [...world.vertices] : [];
};

const boundsOfPoints = (points: readonly Vec3[]) => ({
  min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))),
  max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))),
});

const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const polygonArea = (polygon: readonly Vec2[]): number =>
  Math.abs(polygon.reduce((sum, point, index) => sum + cross2(point, polygon[(index + 1) % polygon.length]!), 0)) / 2;
const ccw2 = (polygon: readonly Vec2[]): Vec2[] => {
  const area = polygon.reduce((sum, point, index) => sum + cross2(point, polygon[(index + 1) % polygon.length]!), 0);
  return area >= 0 ? [...polygon] : [...polygon].reverse();
};

const intersectionPoint = (start: Vec2, end: Vec2, clipStart: Vec2, clipEnd: Vec2): Vec2 => {
  const edge = sub2(clipEnd, clipStart);
  const segment = sub2(end, start);
  const denominator = cross2(edge, segment);
  if (Math.abs(denominator) <= TOLERANCE) {
    return end;
  }
  const t = cross2(edge, sub2(clipStart, start)) / denominator;
  return [start[0] + t * segment[0], start[1] + t * segment[1]];
};

const convexIntersectionArea = (subject: readonly Vec2[], clip: readonly Vec2[]): number => {
  let output = ccw2(subject);
  const boundary = ccw2(clip);
  for (let index = 0; index < boundary.length && output.length > 0; index += 1) {
    const a = boundary[index]!;
    const b = boundary[(index + 1) % boundary.length]!;
    const input = output;
    output = [];
    for (let point = 0; point < input.length; point += 1) {
      const current = input[point]!;
      const previous = input[(point + input.length - 1) % input.length]!;
      const currentInside = cross2(sub2(b, a), sub2(current, a)) >= -TOLERANCE;
      const previousInside = cross2(sub2(b, a), sub2(previous, a)) >= -TOLERANCE;
      if (currentInside !== previousInside) {
        output.push(intersectionPoint(previous, current, a, b));
      }
      if (currentInside) {
        output.push(current);
      }
    }
  }
  return output.length < 3 ? 0 : polygonArea(output);
};

interface FaceProjection {
  origin: Vec3;
  normal: Vec3;
  tangentU: Vec3;
  tangentV: Vec3;
}

const facePolygon = (
  resolved: Resolved,
  part: string,
  solid: Solid,
  projection: FaceProjection,
): Vec2[] | undefined => {
  const shape = worldSolid(resolved.placed.get(part)!, solid);
  if (!('vertices' in shape)) {
    return undefined;
  }
  for (const face of shape.faces) {
    const points = face.map((index) => shape.vertices[index]!);
    if (!points.every((point) => Math.abs(dot(projection.normal, sub(point, projection.origin))) <= TOLERANCE)) {
      continue;
    }
    return ccw2(
      points.map(
        (point) =>
          [
            dot(projection.tangentU, sub(point, projection.origin)),
            dot(projection.tangentV, sub(point, projection.origin)),
          ] as const,
      ),
    );
  }
  return undefined;
};

const vecAngle = (a: Vec3, b: Vec3): number =>
  Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (length(a) * length(b)))));

type ResolvedConnection = Resolved['connections'][number];
type ConnectedPort = ResolvedConnection['from'];

const findFrameGripConnection = (resolved: Resolved): ResolvedConnection | undefined =>
  resolved.connections.find(({ from, to }) => {
    const fromFamily = resolved.defs.get(from.part)?.family;
    const toFamily = resolved.defs.get(to.part)?.family;
    return (
      (fromFamily === 'revolver-frame' && toFamily === 'revolver-grip') ||
      (fromFamily === 'revolver-grip' && toFamily === 'revolver-frame')
    );
  });

const gripCoreContactsFrame = (resolved: Resolved, frameRef: ConnectedPort, gripRef: ConnectedPort): boolean => {
  const frameTransform = resolved.placed.get(frameRef.part)!;
  const gripTransform = resolved.placed.get(gripRef.part)!;
  const frameOrigin = applyPoint(frameTransform, frameRef.port.pos);
  const gripOrigin = applyPoint(gripTransform, gripRef.port.pos);
  if (length(sub(frameOrigin, gripOrigin)) > TOLERANCE) {
    return false;
  }

  const frameNormal = applyDir(frameTransform, frameRef.port.normal);
  const gripNormal = applyDir(gripTransform, gripRef.port.normal);
  if (dot(frameNormal, gripNormal) > -1 + TOLERANCE) {
    return false;
  }

  const tangentX = applyDir(frameTransform, frameRef.port.up);
  const tangentZ = cross(frameNormal, tangentX);
  const frameDef = resolved.defs.get(frameRef.part)!;
  const gripDef = resolved.defs.get(gripRef.part)!;
  const frameJoint = frameDef.solids.find(({ id }) => id === 'rear-joint');
  const gripCore = gripDef.solids.find(({ id }) => id === 'grip-core-neck');
  if (!(frameJoint && gripCore)) {
    return false;
  }

  const frameFace = facePolygon(resolved, frameRef.part, frameJoint, {
    origin: frameOrigin,
    normal: frameNormal,
    tangentU: tangentX,
    tangentV: tangentZ,
  });
  const gripFace = facePolygon(resolved, gripRef.part, gripCore, {
    origin: gripOrigin,
    normal: gripNormal,
    tangentU: tangentX,
    tangentV: tangentZ,
  });
  if (!(frameFace && gripFace)) {
    return false;
  }

  const coreGap = Math.min(
    ...solidVertices(resolved, gripRef.part, gripCore).map((point) =>
      Math.abs(dot(frameNormal, sub(point, frameOrigin))),
    ),
  );
  return coreGap <= TOLERANCE && convexIntersectionArea(frameFace, gripFace) > TOLERANCE;
};

const sideFootprint = (resolved: Resolved, part: string, solid: Solid): Vec2[] | undefined => {
  const points = solidVertices(resolved, part, solid);
  if (points.length === 0) {
    return undefined;
  }
  const z = Math.max(...points.map((point) => point[2]));
  return facePolygon(resolved, part, solid, {
    origin: [0, 0, z],
    normal: [0, 0, 1],
    tangentU: [1, 0, 0],
    tangentV: [0, 1, 0],
  });
};

interface SideBoundary {
  readonly start: Vec2;
  readonly end: Vec2;
}

const sharedSideBoundaryLength = (a: SideBoundary, b: SideBoundary): number => {
  const aDelta: Vec2 = [a.end[0] - a.start[0], a.end[1] - a.start[1]];
  const bDelta: Vec2 = [b.end[0] - b.start[0], b.end[1] - b.start[1]];
  const aLength = Math.hypot(...aDelta);
  const bLength = Math.hypot(...bDelta);
  if (aLength <= TOLERANCE || bLength <= TOLERANCE) {
    return 0;
  }
  const direction: Vec2 = [aDelta[0] / aLength, aDelta[1] / aLength];
  const bDirection: Vec2 = [bDelta[0] / bLength, bDelta[1] / bLength];
  const startOffset: Vec2 = [b.start[0] - a.start[0], b.start[1] - a.start[1]];
  const endOffset: Vec2 = [b.end[0] - a.start[0], b.end[1] - a.start[1]];
  if (
    Math.abs(cross2(direction, bDirection)) > TOLERANCE ||
    Math.abs(cross2(direction, startOffset)) > TOLERANCE ||
    Math.abs(cross2(direction, endOffset)) > TOLERANCE
  ) {
    return 0;
  }
  const start = direction[0] * startOffset[0] + direction[1] * startOffset[1];
  const end = direction[0] * endOffset[0] + direction[1] * endOffset[1];
  return Math.max(0, Math.min(aLength, Math.max(start, end)) - Math.max(0, Math.min(start, end)));
};

const sideSolidsShareEdge = (
  resolved: Resolved,
  a: { part: string; solid: Solid },
  b: { part: string; solid: Solid },
  minimumLength: number,
): boolean => {
  const aPoints = solidVertices(resolved, a.part, a.solid);
  const bPoints = solidVertices(resolved, b.part, b.solid);
  const aMinZ = Math.min(...aPoints.map((point) => point[2]));
  const aMaxZ = Math.max(...aPoints.map((point) => point[2]));
  const bMinZ = Math.min(...bPoints.map((point) => point[2]));
  const bMaxZ = Math.max(...bPoints.map((point) => point[2]));
  if (Math.min(aMaxZ, bMaxZ) - Math.max(aMinZ, bMinZ) <= TOLERANCE) {
    return false;
  }
  const aFace = sideFootprint(resolved, a.part, a.solid);
  const bFace = sideFootprint(resolved, b.part, b.solid);
  if (!(aFace && bFace)) {
    return false;
  }
  const edges = (face: readonly Vec2[]): SideBoundary[] =>
    face.map((start, index) => ({ start, end: face[(index + 1) % face.length]! }));
  return edges(aFace).some((aEdge) =>
    edges(bFace).some((bEdge) => sharedSideBoundaryLength(aEdge, bEdge) >= minimumLength - TOLERANCE),
  );
};

const rearFrameBridgeClosesSilhouette = (
  resolved: Resolved,
  frameRef: ConnectedPort,
  gripRef: ConnectedPort,
): boolean => {
  const frameDef = resolved.defs.get(frameRef.part)!;
  const gripDef = resolved.defs.get(gripRef.part)!;
  const bridge = frameDef.solids.find(({ id }) => id === 'rear-frame-bridge');
  const rearJoint = frameDef.solids.find(({ id }) => id === 'rear-joint');
  const rearGuard = frameDef.solids.find(({ id }) => id === 'trigger-guard-3');
  const gripCore = gripDef.solids.find(({ id }) => id === 'grip-core-neck');
  const joints = [
    bridge &&
      rearJoint &&
      sideSolidsShareEdge(
        resolved,
        { part: frameRef.part, solid: bridge },
        { part: frameRef.part, solid: rearJoint },
        1,
      ),
    bridge &&
      rearGuard &&
      sideSolidsShareEdge(
        resolved,
        { part: frameRef.part, solid: bridge },
        { part: frameRef.part, solid: rearGuard },
        1,
      ),
    bridge &&
      gripCore &&
      sideSolidsShareEdge(resolved, { part: frameRef.part, solid: bridge }, { part: gripRef.part, solid: gripCore }, 1),
  ];
  return Boolean(bridge && rearJoint && rearGuard && gripCore && joints.every(Boolean));
};

const gripPanelMeetsRearSupport = (
  resolved: Resolved,
  refs: { frame: ConnectedPort; grip: ConnectedPort },
  contact: { panel: Solid; rearSupports: readonly Solid[]; frameSideZ: number; near: boolean },
): boolean => {
  const { frame: frameRef, grip: gripRef } = refs;
  const { panel, rearSupports, frameSideZ, near } = contact;
  const panelPoints = solidVertices(resolved, gripRef.part, panel);
  const panelZMin = Math.min(...panelPoints.map((point) => point[2]));
  const panelZMax = Math.max(...panelPoints.map((point) => point[2]));
  const panelInnerZ = near ? panelZMin : panelZMax;
  if (Math.abs(panelInnerZ - frameSideZ) > TOLERANCE) {
    return false;
  }

  const projection: FaceProjection = {
    origin: [0, 0, frameSideZ],
    normal: [0, 0, 1],
    tangentU: [1, 0, 0],
    tangentV: [0, 1, 0],
  };
  const panelFace = facePolygon(resolved, gripRef.part, panel, projection);
  if (!panelFace) {
    return false;
  }
  return rearSupports.some((support) => {
    const supportFace = facePolygon(resolved, frameRef.part, support, projection);
    return supportFace !== undefined && convexIntersectionArea(panelFace, supportFace) > TOLERANCE;
  });
};

const gripPanelsContactFrame = (resolved: Resolved, frameRef: ConnectedPort, gripRef: ConnectedPort): boolean => {
  const frameDef = resolved.defs.get(frameRef.part)!;
  const gripDef = resolved.defs.get(gripRef.part)!;
  const rearSupports = frameDef.solids.filter(({ id }) => id.startsWith('rear-'));
  const nearPanel = gripDef.solids.find(({ id }) => id === 'grip-cover-near');
  const farPanel = gripDef.solids.find(({ id }) => id === 'grip-cover-far');
  if (!(nearPanel && farPanel)) {
    return false;
  }

  const framePoints = rearSupports.flatMap((solid) => solidVertices(resolved, frameRef.part, solid));
  if (framePoints.length === 0) {
    return false;
  }
  const frameZMin = Math.min(...framePoints.map((point) => point[2]));
  const frameZMax = Math.max(...framePoints.map((point) => point[2]));
  return (
    gripPanelMeetsRearSupport(
      resolved,
      { frame: frameRef, grip: gripRef },
      {
        panel: nearPanel,
        rearSupports,
        frameSideZ: frameZMax,
        near: true,
      },
    ) &&
    gripPanelMeetsRearSupport(
      resolved,
      { frame: frameRef, grip: gripRef },
      {
        panel: farPanel,
        rearSupports,
        frameSideZ: frameZMin,
        near: false,
      },
    )
  );
};

/** Geometry contracts are exported for targeted fault tests; generic axis-alignment remains the primary bore rule. */
export const revolverAlignment = {
  topChamberBore(resolved: Parameters<NonNullable<Rule['check']>>[0]): boolean {
    const cylinder = revolverParts(resolved).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(resolved).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    if (!(cylinder && barrel) || resolved.params.get(cylinder)?.chamberIndex?.value !== '0') {
      return true;
    }
    const cylinderDef = resolved.defs.get(cylinder)!;
    const cylinderAxis = cylinderDef.axes.find(({ kind }) => kind === 'bore')!;
    const barrelAxis = resolved.defs.get(barrel)!.axes.find(({ kind }) => kind === 'bore')!;
    const marker = (cylinderDef.displaySolids ?? cylinderDef.solids).find(({ id }) => id === 'chamber-0');
    if (marker?.kind !== 'extruded-polygon') {
      return false;
    }
    const cylinderTransform = resolved.placed.get(cylinder)!;
    const barrelTransform = resolved.placed.get(barrel)!;
    const centre: Vec2 = [
      marker.profile.reduce((sum, point) => sum + point[0], 0) / marker.profile.length,
      marker.profile.reduce((sum, point) => sum + point[1], 0) / marker.profile.length,
    ];
    const markerWorld = applyPoint(
      cylinderTransform,
      extrusionPoint(marker.axis, centre, (marker.z[0] + marker.z[1]) / 2),
    );
    const axisWorld = applyPoint(cylinderTransform, cylinderAxis.origin);
    const markerDelta = sub(markerWorld, axisWorld);
    const dir = applyDir(barrelTransform, barrelAxis.dir);
    return (
      vecAngle(applyDir(cylinderTransform, cylinderAxis.dir), dir) <= TOLERANCE &&
      length(cross(markerDelta, dir)) <= TOLERANCE &&
      length(cross(sub(axisWorld, applyPoint(barrelTransform, barrelAxis.origin)), dir)) <= TOLERANCE
    );
  },
  cylinderAxis(resolved: Parameters<NonNullable<Rule['check']>>[0]): boolean {
    const cylinder = revolverParts(resolved).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(resolved).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    if (!(cylinder && barrel)) {
      return true;
    }
    const cylinderDef = resolved.defs.get(cylinder)!;
    const drum = cylinderDef.solids.find(({ id }) => id === 'drum');
    const axis = cylinderDef.axes.find(({ kind }) => kind === 'revolver-cylinder');
    const bore = resolved.defs.get(barrel)!.axes.find(({ kind }) => kind === 'bore');
    if (!(drum && axis && bore)) {
      return false;
    }
    const cylinderTransform = resolved.placed.get(cylinder)!;
    const barrelTransform = resolved.placed.get(barrel)!;
    const drumBounds = boundsOfPoints(solidVertices(resolved, cylinder, drum));
    const centre: Vec3 = [
      (drumBounds.min[0]! + drumBounds.max[0]!) / 2,
      (drumBounds.min[1]! + drumBounds.max[1]!) / 2,
      (drumBounds.min[2]! + drumBounds.max[2]!) / 2,
    ];
    const declaredCentre = applyPoint(cylinderTransform, axis.origin);
    const boreOrigin = applyPoint(barrelTransform, bore.origin);
    const boreDir = applyDir(barrelTransform, bore.dir);
    const delta = sub(centre, boreOrigin);
    const parallel = vecAngle(applyDir(cylinderTransform, axis.dir), boreDir) <= TOLERANCE;
    const drumAxisOnBody = length(cross(sub(centre, declaredCentre), boreDir)) <= TOLERANCE;
    const drop = dot(delta, [0, -1, 0]);
    const lateral = length(cross(delta, boreDir));
    return (
      parallel &&
      drumAxisOnBody &&
      dot(delta, [0, 1, 0]) < 0 &&
      Math.abs(drop - orbit) <= TOLERANCE &&
      Math.abs(lateral - orbit) <= TOLERANCE
    );
  },
  cylinderGap(resolved: Parameters<NonNullable<Rule['check']>>[0]): boolean {
    const cylinder = revolverParts(resolved).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(resolved).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    const frame = revolverParts(resolved).find(([, def]) => def.family === 'revolver-frame')?.[0];
    if (!(cylinder && barrel && frame)) {
      return true;
    }
    const drum = resolved.defs.get(cylinder)!.solids.find(({ id }) => id === 'drum')!;
    const cone = resolved.defs.get(barrel)!.solids.find(({ id }) => id === 'forcing-cone')!;
    const shield = resolved.defs.get(frame)!.solids.find(({ id }) => id === 'recoil-shield')!;
    const drumBounds = boundsOfPoints(solidVertices(resolved, cylinder, drum));
    const coneBounds = boundsOfPoints(solidVertices(resolved, barrel, cone));
    const shieldBounds = boundsOfPoints(solidVertices(resolved, frame, shield));
    return (
      Math.abs(coneBounds.min[0]! - drumBounds.max[0]! - gap) <= TOLERANCE &&
      Math.abs(shieldBounds.max[0]! - drumBounds.min[0]!) <= TOLERANCE
    );
  },
  topstrapSpan(resolved: Resolved): boolean {
    const frame = revolverParts(resolved).find(([, def]) => def.family === 'revolver-frame')?.[0];
    const cylinder = revolverParts(resolved).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(resolved).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    if (!(frame && cylinder && barrel)) {
      return true;
    }

    const strap = resolved.defs.get(frame)!.solids.find(({ id }) => id === 'topstrap');
    const drum = resolved.defs.get(cylinder)!.solids.find(({ id }) => id === 'drum');
    const bore = resolved.defs.get(barrel)!.axes.find(({ kind }) => kind === 'bore');
    if (!(strap && drum && bore)) {
      return false;
    }

    const strapBounds = boundsOfPoints(solidVertices(resolved, frame, strap));
    const drumBounds = boundsOfPoints(solidVertices(resolved, cylinder, drum));
    const boreOrigin = applyPoint(resolved.placed.get(barrel)!, bore.origin);
    const strapCentreZ = (strapBounds.min[2]! + strapBounds.max[2]!) / 2;
    const drumCentreZ = (drumBounds.min[2]! + drumBounds.max[2]!) / 2;
    const drumClearanceY = strapBounds.min[1]! - drumBounds.max[1]!;
    const strapWidth = strapBounds.max[2]! - strapBounds.min[2]!;
    return (
      Math.abs(strapBounds.min[0]! - (drumBounds.min[0]! - C.topstrapRearOverhang.pickedU)) <= TOLERANCE &&
      strapBounds.max[0]! >= drumBounds.max[0]! - TOLERANCE &&
      strapBounds.max[0]! <= frameFrontX + TOLERANCE &&
      drumClearanceY > TOLERANCE &&
      Math.abs(strapWidth - C.topstrapWidth.pickedU) <= TOLERANCE &&
      Math.abs(strapCentreZ - drumCentreZ) <= TOLERANCE &&
      Math.abs(drumCentreZ - boreOrigin[2]) <= TOLERANCE
    );
  },
  gripJoint(resolved: Resolved): boolean {
    const connection = findFrameGripConnection(resolved);
    if (!(connection && resolved.placed.has(connection.from.part) && resolved.placed.has(connection.to.part))) {
      return true;
    }
    const frameRef =
      resolved.defs.get(connection.from.part)?.family === 'revolver-frame' ? connection.from : connection.to;
    const gripRef = frameRef === connection.from ? connection.to : connection.from;
    const checks = [
      gripCoreContactsFrame(resolved, frameRef, gripRef),
      rearFrameBridgeClosesSilhouette(resolved, frameRef, gripRef),
      gripPanelsContactFrame(resolved, frameRef, gripRef),
    ];
    return checks.every(Boolean);
  },
  triggerBow(resolved: Parameters<NonNullable<Rule['check']>>[0]): boolean {
    const frame = revolverParts(resolved).find(([, def]) => def.family === 'revolver-frame')?.[0];
    if (!frame) {
      return true;
    }
    const frameDef = resolved.defs.get(frame)!;
    const guards = frameDef.solids
      .filter(({ id }) => TRIGGER_GUARD_ID.test(id))
      .sort((a, b) => Number(a.id.slice('trigger-guard-'.length)) - Number(b.id.slice('trigger-guard-'.length)));
    const triggers = frameDef.solids.filter(({ id }) => TRIGGER_ID.test(id));
    if (
      guards.length !== 10 ||
      guards.some((solid, index) => solid.id !== `trigger-guard-${index}` || solid.kind !== 'extruded-polygon') ||
      triggers.length !== 4 ||
      triggers.some((solid) => solid.kind !== 'extruded-polygon')
    ) {
      return false;
    }
    for (let index = 0; index < guards.length; index += 1) {
      const guard = guards[index]!;
      const next = guards[(index + 1) % guards.length]!;
      if (guard.kind !== 'extruded-polygon' || next.kind !== 'extruded-polygon') {
        return false;
      }
      if (!sideSolidsShareEdge(resolved, { part: frame, solid: guard }, { part: frame, solid: next }, 0.1)) {
        return false;
      }
    }

    const innerLoop = guards.map((solid) => {
      if (solid.kind !== 'extruded-polygon') {
        return [Number.NaN, Number.NaN] as Vec2;
      }
      return solid.profile[3]!;
    });
    const ccwInnerLoop = ccw2(innerLoop);
    const loopTopY = Math.max(...innerLoop.map((point) => point[1]));
    const triggerInsideLoop = (point: Vec2): boolean =>
      ccwInnerLoop.every((start, index) => {
        const end = ccwInnerLoop[(index + 1) % ccwInnerLoop.length]!;
        return cross2(sub2(end, start), sub2(point, start)) >= -TOLERANCE;
      });
    const guardDepthMin = Math.max(
      ...guards.map((solid) => (solid.kind === 'extruded-polygon' ? solid.z[0] : Number.POSITIVE_INFINITY)),
    );
    const guardDepthMax = Math.min(
      ...guards.map((solid) => (solid.kind === 'extruded-polygon' ? solid.z[1] : Number.NEGATIVE_INFINITY)),
    );
    const floor = frameDef.solids.find(({ id }) => id === 'frame-floor');
    if (!(floor?.kind === 'extruded-polygon' && guardDepthMax > guardDepthMin)) {
      return false;
    }
    const floorBottomY = Math.min(...floor.profile.map(([, y]) => y));
    const floorBottomEdge = floor.profile.filter(([, y]) => Math.abs(y - floorBottomY) <= TOLERANCE);
    // Only the trigger's original root vertices may attach outside the bow, on this real frame-floor face.
    const rootProfile = triggerProfiles[0]!.filter(([, y]) => Math.abs(y - floorBottomY) <= TOLERANCE);
    if (floorBottomEdge.length < 2 || rootProfile.length < 2) {
      return false;
    }
    const rootMinX = Math.max(Math.min(...floorBottomEdge.map(([x]) => x)), Math.min(...rootProfile.map(([x]) => x)));
    const rootMaxX = Math.min(Math.max(...floorBottomEdge.map(([x]) => x)), Math.max(...rootProfile.map(([x]) => x)));
    return triggers.every((trigger) => {
      if (
        trigger.kind !== 'extruded-polygon' ||
        trigger.z[0] < guardDepthMin - TOLERANCE ||
        trigger.z[1] > guardDepthMax + TOLERANCE
      ) {
        return false;
      }
      const rootDepthWithinFloor = trigger.z[0] >= floor.z[0] - TOLERANCE && trigger.z[1] <= floor.z[1] + TOLERANCE;
      const atFrameFloorRoot = (point: Vec2): boolean =>
        trigger.id === 'curved-trigger-0' &&
        rootDepthWithinFloor &&
        point[1] > loopTopY + TOLERANCE &&
        Math.abs(point[1] - floorBottomY) <= TOLERANCE &&
        point[0] >= rootMinX - TOLERANCE &&
        point[0] <= rootMaxX + TOLERANCE;
      return trigger.profile.every((point) => triggerInsideLoop(point) || atFrameFloorRoot(point));
    });
  },
};

const revolverRule = (
  id: string,
  title: string,
  passes: (resolved: Parameters<NonNullable<Rule['check']>>[0]) => boolean,
): Rule => ({
  id,
  title,
  check(resolved) {
    return passes(resolved)
      ? []
      : [{ rule: id, message: `${title} failed.`, parts: revolverParts(resolved).map(([part]) => part) }];
  },
});

export const revolverRules: Rule[] = [
  revolverRule(
    'revolver-top-chamber-bore',
    'Top chamber bore aligns with barrel bore',
    revolverAlignment.topChamberBore,
  ),
  revolverRule('revolver-cylinder-axis', 'Cylinder axis aligns with barrel bore', revolverAlignment.cylinderAxis),
  revolverRule('revolver-cylinder-gap', 'Cylinder gap and recoil shield alignment', revolverAlignment.cylinderGap),
  revolverRule(
    'revolver-topstrap-span',
    'Topstrap stays within the actual frame/cylinder envelope',
    revolverAlignment.topstrapSpan,
  ),
  revolverRule('revolver-grip-joint', 'Grip core and both panels meet the rear frame', revolverAlignment.gripJoint),
  revolverRule(
    'revolver-trigger-bow',
    'Ten joined guard prisms preserve the trigger bow',
    revolverAlignment.triggerBow,
  ),
];

export const revolverFamilySet: Readonly<Record<string, PartFamily>> = {
  'revolver-frame': revolverFrame,
  'revolver-cylinder': revolverCylinder,
  'revolver-barrel': revolverBarrel,
  'revolver-grip': revolverGrip,
};
