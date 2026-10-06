import { GRID } from '../core/conventions.ts';

/**
 * AK v2 proportions, mapped from BR's golden reference, an Izhmash AKM photographed from the right:
 * https://www.americanrifleman.org/media/caqhmu12/izhmash_akm_right.jpg?width=1920&height=620
 *
 * The photo was scaled by the AKM's published 880 mm overall length (checked against its 378 mm sight
 * radius), registered on the bore (the line through the barrel's centres) and on the receiver's front
 * face, and read edge by edge. Every value is in u in the assembly frame: x forward from the receiver's
 * front face, y up from the bore. Silhouette estimates, snapped to the grid; widths are not in a side
 * view and keep the earlier model's.
 */
const snap = (value: number) => Math.round(value / GRID) * GRID;

/** The receiver: the stamped shell with its dust cover, over a lower plate that reaches its bottom. */
const receiver = {
  rearX: -23,
  bottomU: -2.5,
  shellBottomU: -1,
  roofU: 3,
  halfWidthU: 2,
  /** The rear face's top; the dust cover's end slopes up from it to the roof over `rearSlopeRunU`. */
  rearFaceTopU: 0.5,
  rearSlopeRunU: 3,
} as const;

/**
 * The carrier rides as high as the dust cover's 0.5u wall allows, with its gas piston on the gas
 * cylinder's axis.
 */
const gasAxisU = 2.25;
const carrierAxisU = 1;

/** The rear-sight block: on the receiver's front roof and on ahead of it, where the gas cylinder starts. */
const sightBase = { rearX: -2.75, frontX: 3.5, bottomU: 1.5, topU: 3.75, halfWidthU: 1.25 } as const;

const barrelLengthU = { S: 22, M: 32, L: 42 } as const;

export const AK_PROPORTIONS = {
  receiver,
  carrierAxisU,
  /** The piston's height on the carrier, so its axis is the gas cylinder's. */
  pistonOnCarrierU: gasAxisU - carrierAxisU,
  sightBase,
  /** Rear notch and front post tip: the sight line runs parallel to the bore. */
  sightLineU: 4.25,
  rearSightX: -2.5,
  lower: { magazineX: -7.5, gripX: -18.5, triggerX: -15 },
  barrel: {
    lengthU: barrelLengthU,
    /** The slant brake: its top lip ends `topLipU` past the barrel, the cut falls forward at 45°. */
    brake: { lengthU: 2, flatRadiusU: 0.75, topLipU: 0.75 },
  },
  gas: {
    axisU: gasAxisU,
    flatRadiusU: 0.75,
    /** The gas port, and the block's collar centre on it, as a fraction of the barrel's length. */
    portFraction: 0.69,
  },
  /** The gas block, about its port: a flat top from the cylinder's end face, raked down to the collar's front. */
  gasBlock: { rearX: -3.5, flatTopX: -2.25, collarHalfLengthU: 1.25, halfWidthU: 0.75 },
  frontSight: { behindBarrelEndU: 1.75, postBaseU: 3.5, earBottomU: 3.25, earTopU: 4.5 },
  handguard: {
    lengthU: { S: 8, M: 14, L: 22 },
    /** Every handguard wall, the lower handguard's bottom included (BR, 2026-10-06 20:27). */
    wallU: 0.5,
    lowerBottomU: -2,
    lowerTopU: sightBase.bottomU,
    lowerHalfWidthU: 1.5,
    upperStartX: 4,
    upperTopU: 3.5,
    /** The steel retaining ring at the handguards' front end. */
    ringLengthU: 0.5,
    cylinderPortX: 8,
  },
  /**
   * The wooden buttstock, measured back from the receiver's rear face, whose height its front takes. The
   * comb drops gently; underneath, the neck curves down from the receiver's bottom into a straight belly
   * that rounds off into the toe.
   */
  stock: {
    lengthU: { S: 13.25, M: 16.25, L: 19.25 },
    /** The comb runs level from behind the neck's saddle back to the heel. */
    comb: { x: -8, topU: -0.25 },
    /** The neck's top dips into a saddle behind the receiver's tang, then rises to the comb (BR 22:42). */
    saddle: { x: -5, topU: -0.75, frontSlope: 0.15 },
    neck: { x: -2, dropU: 1.5, frontSlope: 1.25 },
    bellySlope: 0.29,
    toeRoundU: 2.25,
    /** About 60% of the receiver-wide stock BR saw (22:42), each full width on the grid. */
    halfWidthU: { front: 1.25, butt: 1.375 },
    buttplateU: 0.5,
    /** How far the toe sits behind the heel. */
    buttRakeU: 0.25,
  },
} as const;

/** Where the gas port sits on a barrel of the given length, on the grid. */
export const akGasPortX = (barrelLength: number): number => snap(barrelLength * AK_PROPORTIONS.gas.portFraction);
