import type { Solid } from '../../core/schema.ts';
import { inchesToU, mmToU } from './cartridge.ts';
import { box } from './common.ts';

/**
 * STAND-IN, to be replaced by the attachments work (optics and scopes are the next gungen iteration): the space a
 * full-size, high-magnification rifle scope takes on the rail, so the carry handle can be sized and placed to clear
 * it. It is not a part, and nothing but test/antiMateriel.test.ts reads it.
 *
 * Dimensions are those of the Leupold Mark 4HD 6-24x52 (leupold.com/mark-4hd-6-24x52-m5c3-side-focus-ffp-illum-pr2-mil,
 * "Dimensions", read 2026-10-01): total length 14.6 in, total mounting space 6.3 in, eyepiece length 3.3 in,
 * objective length 5.1 in, objective diameter 2.4 in, eyepiece diameter 1.8 in, main tube 34 mm. The ring height
 * is that of Leupold's Mark 4 34mm High ring (leupold.com/mark-4-34mm-aluminum-high-matte, "Ring Height (in)
 * 1.06"), taken as the distance from the rail to the bottom of the tube; with it the 2.4 in objective stands 0.53 in
 * clear of the rail, which a 52 mm scope needs, so that reading is the consistent one.
 *
 * Local frame: x along the bore from the middle of the mounting space, y up from the rail face, z across. Radii
 * round up and the axis height rounds to the 0.25u grid.
 */
const grid = (value: number): number => Math.round(value / 0.25) * 0.25;
const gridUp = (value: number): number => Math.ceil(value / 0.25 - 1e-9) * 0.25;

const MOUNTING_HALF_LENGTH = inchesToU(6.3) / 2;
const EYEPIECE_LENGTH = inchesToU(3.3);
const OBJECTIVE_LENGTH = inchesToU(5.1);
const TUBE_RADIUS = gridUp(mmToU(34) / 2);
const EYEPIECE_RADIUS = gridUp(inchesToU(1.8) / 2);
const OBJECTIVE_RADIUS = gridUp(inchesToU(2.4) / 2);
/** Rail face to the tube's axis: the ring height to the tube's bottom, plus the tube's own radius. */
const AXIS_Y = grid(inchesToU(1.06) + mmToU(34) / 2);

const cylinderBox = (id: string, x: readonly [number, number], radius: number): Solid =>
  box(id, [x[0], AXIS_Y - radius, -radius], [x[1], AXIS_Y + radius, radius]);

export const STAND_IN_SCOPE_ENVELOPE: readonly Solid[] = [
  cylinderBox('eyepiece', [-MOUNTING_HALF_LENGTH - EYEPIECE_LENGTH, -MOUNTING_HALF_LENGTH], EYEPIECE_RADIUS),
  cylinderBox('tube', [-MOUNTING_HALF_LENGTH, MOUNTING_HALF_LENGTH], TUBE_RADIUS),
  cylinderBox('objective', [MOUNTING_HALF_LENGTH, MOUNTING_HALF_LENGTH + OBJECTIVE_LENGTH], OBJECTIVE_RADIUS),
];
