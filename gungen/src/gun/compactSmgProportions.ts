import { GRID } from '@skelly/engine/foundation/conventions.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';

const mmToU = (millimetres: number): number => millimetres / (METRES_PER_UNIT * 1000);
const snap = (value: number): number => Math.round(value / GRID) * GRID;

const barrelTipThreadedU = 16;
const barrelTipPlainU = 15;
const receiverRearX = -20;

/** The stock's reach behind the receiver's rear face, for an overall length from the threaded muzzle tip. */
const stockLengthU = (overallLengthMm: number): number =>
  snap(mmToU(overallLengthMm) - barrelTipThreadedU + receiverRearX);

/**
 * Bore-registered side-profile estimates; see `gungen/docs/compact-smg-export.md`, "Reference registration".
 * The trace data is not tracked, so the values derive from that doc's cited dimensions and registration.
 */
export const COMPACT_SMG_PROPORTIONS = {
  receiver: {
    rearX: receiverRearX,
    frontX: 0,
    halfHeightU: 2.5,
    halfWidthU: 2.25,
    chamferU: 0.25,
    topFlatHalfWidthU: 1.75,
  },
  // Lengths run from the barrel's seat at the receiver's front face to the muzzle tip.
  barrel: { tipU: { threaded: barrelTipThreadedU, plain: barrelTipPlainU } },
  // Both sights share one horizontal sight line above the bore. The drum's apertures sit on a rim of
  // `rimU` about its axis; the first `apertureCount` of top, left, right and bottom are open.
  sights: {
    sightLineU: 7,
    front: { behindTipU: 1, ringInnerRadiusU: 1, ringThicknessU: 0.5 },
    rear: { xU: -15, drumRadiusU: 2.5, drumThicknessU: 1.5, rimU: 1.5, apertureHalfU: 0.5, apertureCount: 4 },
  },
  handguard: { lengthU: 12.5 },
  grip: { lengthU: 8.5 },
  magazine: { lengthU: 14 },
  // Overall lengths run from the muzzle tip to the butt plate's rear face.
  stock: {
    overallLengthMm: { telescopingExtended: 700, telescopingCollapsed: 550, fixed: 680 },
    lengthU: {
      telescopingExtended: stockLengthU(700),
      telescopingCollapsed: stockLengthU(550),
      fixed: stockLengthU(680),
    },
  },
} as const;
