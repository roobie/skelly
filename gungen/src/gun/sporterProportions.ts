import { TAPERED_STOCK_PROPORTIONS } from './shotgunProportions.ts';

const stockSeatY = -2;
const jointTopU = TAPERED_STOCK_PROPORTIONS.combAtJointU + stockSeatY;
const jointBottomU = -2.5 + stockSeatY;

/** Bore-registered side-profile estimates; see `gungen/docs/bolt-action-export.md`, "Reference registration". */
export const SPORTER_PROPORTIONS = {
  referenceOverallLengthMm: 41.5 * 25.4,
  receiver: {
    rearX: -16,
    frontX: 0,
    flatRadiusU: 1.25,
    carrierAxisU: 0,
    ringRearX: -3.5,
    ringRadiusU: 1.5,
    railPlateU: 0.25,
  },
  stock: {
    seatY: stockSeatY,
    genericSeatY: -2.5,
    joinTopU: jointTopU,
    joinBottomU: jointBottomU,
    lengthU: { S: 24.75, M: 27.75, L: 30.75 },
    combDegrees: ['2', '0', '1', '3', '4', '5', '6'],
  },
  barrel: { lengthU: { S: 28, M: 38, L: 48 } },
  frontSight: { muzzleInsetRatios: ['0.05', '0.025', '0.075', '0.1'], sightLineU: 2, rearX: 6.5 },
  // A barrel-mounted open leaf is viewed from the stock, not with the eye against its notch. The notch is wide enough
  // to leave two detail voxels open (see `gungen/test/rearSightNotch.test.ts`).
  rearSight: { eyeReliefU: 24, halfWidthU: 0.625, notchHalfWidthU: 0.25, notchDepthU: 0.25 },
  foreEnd: {
    lengthU: { S: 14.5, M: 17.5, L: 20.5 },
    capLengthU: 3.5,
    supportFraction: 0.6,
    halfWidthU: 1.5,
    rearHalfWidthU: TAPERED_STOCK_PROPORTIONS.halfWidthU.connector,
    clearanceU: 0.1,
    stations: [
      [-16, jointTopU, jointBottomU],
      [-12, -0.75, jointBottomU],
      [-8, -0.5, -3.75],
      [0, -0.5, -3.5],
    ] as const,
    noseTopU: -0.75,
    noseBottomU: -2.5,
    tipTopU: -1,
    tipBottomU: -1.75,
  },
  lower: {
    mountY: jointBottomU,
    plateThicknessU: 0.25,
    plateHalfWidthU: 1.25,
    finger: { x: [-15.5, -12.5], y: [-2.25, -0.5], z: [-0.75, 0.75] },
    guardWallU: 0.25,
    guardSideClearanceU: 0.25,
    guardCornerU: 0.375,
    guardHalfWidthU: 0.375,
    trigger: [
      [
        [-15.25, -1.25],
        [-14.75, -1.5],
        [-14, -0.5],
        [-14.5, -0.5],
      ],
      [
        [-15.25, -1.25],
        [-15, -1.75],
        [-14.5, -2],
        [-14.75, -1.5],
      ],
    ] as const,
  },
  magazine: { feedPortY: -1.75 },
  handle: {
    rearInsetU: 1,
    sideRootClearanceU: 0.25,
    axis: [1, -4, -3] as const,
    armLength: 4,
    knobFlatRadius: 0.625,
    liftRadians: Math.PI / 3,
    reliefX: [-16, -14.5],
    reliefBottomU: -1.75,
  },
  pillars: [
    { x: [-12, -11.5], bottomU: jointBottomU, topU: -1.25, halfWidthU: 0.25 },
    { x: [-0.5, 0], bottomU: -3.5, topU: -1.25, halfWidthU: 0.25 },
  ],
  tang: { rearX: -19, frontX: -14.5, topU: -1, bottomU: -1.5, rearTopU: -1.75, rearBottomU: -2.25, halfWidthU: 0.375 },
  recoilLug: { rearX: -0.5, frontX: 0, bottomU: -2.5, topU: -1, halfWidthU: 1 },
} as const;
