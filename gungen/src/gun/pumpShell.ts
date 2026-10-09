// Pump-shotgun action envelope derived from the cited shotshell record, not a second set of cartridge measurements.

import { GRID } from '@skelly/engine/core/conventions.ts';
import shellJson from '../../cartridges/12-gauge-00-buck.json' with { type: 'json' };
import { formatCartridgeParseError, parseCartridge } from '../ammo/parseCartridge.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';

const parsed = parseCartridge(shellJson);
if (!parsed.ok) {
  throw new Error(`Invalid pump-shotgun cartridge data: ${formatCartridgeParseError(parsed.error)}`);
}
if (
  parsed.cartridge.kind !== 'shotshell' ||
  parsed.cartridge.length.loaded.value === null ||
  parsed.cartridge.head.rimDiameter.value === null
) {
  throw new Error('Pump-shotgun cartridge data must include a loaded shotshell length.');
}

/** Conservative rolled-closed shell length converted from millimetres to gungen units. */
export const PUMP_SHELL_LOADED_LENGTH_U = parsed.cartridge.length.loaded.value / (METRES_PER_UNIT * 1000);

/** Round the minimum shell-clearance stroke up to the geometry grid, never down. */
export const PUMP_ACTION_TRAVEL_U = Math.ceil(PUMP_SHELL_LOADED_LENGTH_U / GRID) * GRID;

/** Grid-rounded single-shell loading aperture: loaded length + two quarter-unit end clearances. */
export const PUMP_LOADING_PORT_X: readonly [number, number] = [
  -2 - Math.ceil((PUMP_SHELL_LOADED_LENGTH_U + 2 * GRID) / GRID) * GRID,
  -2,
];
/** Rim diameter, rounded up to the grid; the existing L tube/receiver frame admits 12 gauge. */
export const PUMP_LOADING_PORT_HALF_WIDTH_U =
  (Math.ceil(parsed.cartridge.head.rimDiameter.value / (METRES_PER_UNIT * 1000) / GRID) * GRID) / 2;
