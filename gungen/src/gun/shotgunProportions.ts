import { GRID } from '@skelly/engine/core/conventions.ts';

/**
 * Silhouette estimates, not manufacturing measurements, from the Remington 870 photo:
 * https://photo.weaponsystems.net/image/s-carousel/n-fa_sg_m870_v1.jpg/--/img/ws/fa_sg_m870_v1.jpg
 * Receiver ≈100×31px, stock ≈170px long, pad ≈64px tall; forend ≈97×27px,
 * starting ≈46px ahead of the receiver front. Saddle ≈3px; throat sweep ≈69°;
 * comb ≈6.2°, shoulder face ≈4.6° (heel aft of toe).
 * The approved receiver is 19.5u long but only 5u tall: use length ratios for
 * longitudinal stations and height ratios for bulk, not stock-length-scaled hands.
 */
const snapUp = (value: number) => Math.ceil(value / GRID) * GRID;
const mediumStockLengthU = snapUp(19.5 * 1.7);
export const TAPERED_STOCK_PROPORTIONS = {
  lengthU: { S: mediumStockLengthU - 3, M: mediumStockLengthU, L: mediumStockLengthU + 3 },
  buttHeightU: { S: 10, M: 10.5, L: 11 },
  combDegrees: 6,
  padPitchDegrees: 4.5,
  padLengthRatio: 0.06,
  combAtJointU: 1,
  wristStartX: -0.75,
  wristX: -2.75,
  throatStartBottomU: -2.25,
  throatEndX: -6,
  throatEndBottomU: -6,
  gripX: -7.5,
  gripTopU: -0.5,
  gripBottomU: -7.5,
  combCrestX: -11,
  combCrestTopU: 0,
  combStartX: -13,
  neckBottomU: -6.75,
  halfWidthU: { connector: 1.5, wrist: 0.875, grip: 1.125, joint: 1.25, butt: 1.5 },
  // Circular throat chord error stays below 0.025u (0.3mm), sub-pixel in the review view.
  curveSegments: 12,
  holdPoint: [-2.75, -2.25, 0],
} as const;
export const PUMP_FOREND_PROPORTIONS = {
  mountX: snapUp(19.5 * 0.46),
  lengthU: snapUp(19.5 * 0.97),
  outerRadiusU: 2.4,
  barrelClearanceU: 0.05,
} as const;
export const COMPACT_TRIGGER_PLATE = {
  thicknessU: 0.5,
  fingerTopU: -0.75,
  fingerBottomU: -2.25,
  cornerU: 0.5,
} as const;
