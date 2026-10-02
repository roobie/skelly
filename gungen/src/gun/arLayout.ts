import { GRID } from '../core/conventions.ts';
import { GUN_UNITS } from './units.ts';

const mmPerUnit = GUN_UNITS.metresPerUnit * 1000;
const snapUp = (mm: number): number => Math.ceil(mm / mmPerUnit / GRID - 1e-9) * GRID;

/**
 * AR axial reference: 5.56x45's 44.7mm case and 57.4mm overall maximum,
 * NATO AOP-4172 Annex A Sheet 1 (cartridges/5.56x45.json).
 * The ratios below are stylized AR proportion estimates, NOT measured tolerances:
 * an upper about 3.2 rounds long (~184mm), and a barrel extension about 0.55
 * cases long (~25mm / one inch), seated inside its front. The port exposes one
 * case-length carrier face plus the shared margin; it is not a full-stroke slot.
 * All bore bands retain this axial action envelope, just as they retain the
 * 6.5u stroke. Real per-cartridge sizing is not yet propagated into gun parts.
 */
export const AR_ACTION_LAYOUT = {
  receiverLengthU: snapUp(3.2 * 57.4),
  barrelExtensionLengthU: snapUp(0.55 * 44.7),
  carrierFaceLengthU: snapUp(44.7),
} as const;
