// The .50 BMG round the anti-materiel rifle is sized from (docs/anti-materiel.md, "Proportions"). Its
// dimensions are the only numbers the magazine, the magazine well and the action are derived from, so
// they live here once. Pure arithmetic: no imports beyond core constants.

import { METRES_PER_UNIT } from '../exportFrame.ts';

const MM_PER_INCH = 25.4;
const MM_PER_U = METRES_PER_UNIT * 1000;
export const inchesToU = (inches: number): number => (inches * MM_PER_INCH) / MM_PER_U;
export const mmToU = (mm: number): number => mm / MM_PER_U;

/**
 * .50 BMG (12.7x99mm NATO), English Wikipedia infobox ".50 BMG", fields `length` (5.450 in, overall
 * length), `case_length` (3.910 in) and `base` (0.804 in, case base diameter; `rim_dia` is the same).
 */
export const BMG_OVERALL_LENGTH_U = inchesToU(5.45);
export const BMG_CASE_LENGTH_U = inchesToU(3.91);
export const BMG_BASE_DIAMETER_U = inchesToU(0.804);

/** The smallest multiple of `step` that is at least `value` (a float-noise tolerance keeps exact multiples). */
export const ceilTo = (value: number, step: number): number => Math.ceil(value / step - 1e-9) * step;
