// Pump-shotgun action envelope derived from the cited shotshell record, not a second set of cartridge measurements.

import shellJson from '../../cartridges/12-gauge-00-buck.json' with { type: 'json' };
import { formatCartridgeParseError, parseCartridge } from '../ammo/parseCartridge.ts';
import { GRID } from '../core/conventions.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';

const parsed = parseCartridge(shellJson);
if (!parsed.ok) {
  throw new Error(`Invalid pump-shotgun cartridge data: ${formatCartridgeParseError(parsed.error)}`);
}
if (parsed.cartridge.kind !== 'shotshell' || parsed.cartridge.length.loaded.value === null) {
  throw new Error('Pump-shotgun cartridge data must include a loaded shotshell length.');
}

/** Conservative rolled-closed shell length converted from millimetres to gungen units. */
export const PUMP_SHELL_LOADED_LENGTH_U = parsed.cartridge.length.loaded.value / (METRES_PER_UNIT * 1000);

/** Round the minimum shell-clearance stroke up to the geometry grid, never down. */
export const PUMP_ACTION_TRAVEL_U = Math.ceil(PUMP_SHELL_LOADED_LENGTH_U / GRID) * GRID;
