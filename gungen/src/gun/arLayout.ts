import { GRID } from '../core/conventions.ts';
import { SMALL_AR_FRAME } from './arFrames.ts';
import { GUN_UNITS } from './units.ts';

const mmPerUnit = GUN_UNITS.metresPerUnit * 1000;
const snapUp = (mm: number): number => Math.ceil(mm / mmPerUnit / GRID - 1e-9) * GRID;
const units = (mm: number): number => snapUp(mm);
const { dimensions } = SMALL_AR_FRAME;

export const AR_ACTION_LAYOUT = {
  frameId: SMALL_AR_FRAME.id,
  receiverLengthU: units(dimensions.receiverLengthMm.value),
  receiverHeightU: units(dimensions.receiverHeightMm.value),
  barrelExtensionLengthU: units(dimensions.barrelExtensionLengthMm.value),
  barrelExtensionDiameterU: units(dimensions.barrelExtensionDiameterMm.value),
  carrierFaceLengthU: units(dimensions.carrierLengthMm.value),
  carrierTravelU: units(dimensions.carrierTravelMm.value),
  ejectionPortLengthU: units(dimensions.ejectionPortLengthMm.value),
  ejectionPortHeightU: units(dimensions.ejectionPortHeightMm.value),
  magwellOpeningLengthU: units(dimensions.magwellOpeningLengthMm.value),
  magwellOpeningWidthU: units(dimensions.magwellOpeningWidthMm.value),
} as const;
