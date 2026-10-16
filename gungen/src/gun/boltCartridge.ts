import { GRID } from '@skelly/engine/core/conventions.ts';
import cartridgeJson from '../../cartridges/308-winchester.json' with { type: 'json' };
import type { Cartridge } from '../ammo/cartridge.ts';
import { formatCartridgeParseError, parseCartridge } from '../ammo/parseCartridge.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';

const parsed = parseCartridge(cartridgeJson);
if (!parsed.ok) {
  throw new Error(formatCartridgeParseError(parsed.error));
}
export const BOLT_CARTRIDGE = parsed.cartridge;
/** Visual extraction allowance, not a manufacturing tolerance. */
export const BOLT_EXTRACTION_CLEARANCE_U = 2 * GRID;
export const boltStrokeUnits = (cartridge: Cartridge): number => {
  if (cartridge.kind !== 'metallic' || cartridge.overallLength.max.value === null) {
    throw new Error('Bolt travel needs a sourced metallic cartridge overall length');
  }
  return (
    Math.ceil((cartridge.overallLength.max.value / (METRES_PER_UNIT * 1000) + BOLT_EXTRACTION_CLEARANCE_U) / GRID) *
    GRID
  );
};
export const BOLT_ACTION_TRAVEL_U = boltStrokeUnits(BOLT_CARTRIDGE);
/** Estimated integral-well wall and follower reserve. */
export const BOLT_MAGAZINE_WALL_U = GRID;
export const BOLT_MAGAZINE_RESERVE_U = 2 * GRID;
export const boltMagazineSection = () => {
  if (BOLT_CARTRIDGE.kind !== 'metallic' || BOLT_CARTRIDGE.case.rim.diameter.value === null) {
    throw new Error('Integral well requires a sourced cartridge rim');
  }
  const mmPerUnit = METRES_PER_UNIT * 1000;
  return {
    depth:
      Math.ceil(BOLT_CARTRIDGE.overallLength.max.value! / mmPerUnit / (2 * GRID)) * (2 * GRID) +
      2 * BOLT_MAGAZINE_WALL_U,
    width:
      Math.ceil(BOLT_CARTRIDGE.case.rim.diameter.value / mmPerUnit / (2 * GRID)) * (2 * GRID) +
      2 * BOLT_MAGAZINE_WALL_U,
  };
};
