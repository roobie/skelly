import cartridgeJson from '../../cartridges/5.56x45.json' with { type: 'json' };
import { parseCartridge } from '../ammo/parseCartridge.ts';
import { GRID } from '../core/conventions.ts';
import {
  type ActionFrame,
  AR_FRAME_RANKS,
  type CartridgeClearanceMeasure,
  type CartridgeFrameMeasures,
  type FrameMeasure,
  selectFrame,
} from './actionFrame.ts';
import { GUN_UNITS } from './units.ts';

const parsedCartridge = parseCartridge(cartridgeJson);
if (!parsedCartridge.ok || parsedCartridge.cartridge.kind !== 'metallic') {
  throw new Error('The small AR frame requires sourced metallic cartridge 5.56x45 data.');
}
const { cartridge } = parsedCartridge;
const mmPerUnit = GUN_UNITS.metresPerUnit * 1000;
const snapUpToGrid = (mm: number): number => Math.ceil(mm / mmPerUnit / GRID - 1e-9) * GRID * mmPerUnit;
const rimDiameterMm = cartridge.case.rim.diameter.value;
const bodyHeadDiameterMm = cartridge.case.body.diameterAtHead.value;
if (rimDiameterMm === null || bodyHeadDiameterMm === null) {
  throw new Error('The small AR frame requires sourced 5.56x45 case-head diameters.');
}
const caseHeadDiameterMm = Math.max(rimDiameterMm, bodyHeadDiameterMm);

export const SMALL_AR_CARTRIDGE: CartridgeFrameMeasures = {
  id: cartridge.id,
  maximumOverallLengthMm: cartridge.overallLength.max.value,
  maximumHeadDiameterMm: caseHeadDiameterMm,
  caseLengthMm: cartridge.case.length.value,
};

const clearanceMm = (units: number): number => units * mmPerUnit;
const derivedMeasure = (
  source: CartridgeClearanceMeasure,
  clearanceUnits: number,
  method: string,
  options: { readonly multiplier?: number; readonly snapToGunGrid?: boolean } = {},
): FrameMeasure => {
  const { multiplier = 1, snapToGunGrid = true } = options;
  const sourceValue = SMALL_AR_CARTRIDGE[source];
  if (sourceValue === null) {
    throw new Error(`The small AR frame requires sourced 5.56x45 ${source}.`);
  }
  const clearance = clearanceMm(clearanceUnits);
  const minimum = sourceValue * multiplier + clearance;
  return {
    value: snapToGunGrid ? snapUpToGrid(minimum) : minimum,
    evidence: {
      kind: 'estimate',
      method: `Derived from cartridges/5.56x45.json (${method}) plus ${clearanceUnits}u (${clearance} mm) clearance${snapToGunGrid ? ', rounded up to the gun grid' : ''}.`,
    },
    cartridgeClearance: {
      measure: source,
      ...(multiplier === 1 ? {} : { multiplier }),
      clearanceMm: clearance,
    },
  };
};

const estimatedReceiverMeasure = (value: number, method: string): FrameMeasure => ({
  value,
  evidence: { kind: 'estimate', method },
});

const receiverPhoto = 'https://commons.wikimedia.org/wiki/File:PEO_M4_Carbine_RAS_M68_CCO.png';
const m4LengthSpecification = 'https://en.wikipedia.org/wiki/M4_carbine';

export const SMALL_AR_FRAME: ActionFrame = {
  id: 'small',
  rank: AR_FRAME_RANKS.small,
  fit: {
    maximumOverallLengthMm: derivedMeasure(
      'maximumOverallLengthMm',
      0.25,
      'NATO AOP-4172 Annex A, Sheet 1, maximum cartridge overall length',
      { snapToGunGrid: false },
    ),
    maximumHeadDiameterMm: derivedMeasure(
      'maximumHeadDiameterMm',
      0.25,
      'NATO AOP-4172 Annex A, Sheet 1, maximum rim and case-head diameter',
      { snapToGunGrid: false },
    ),
  },
  dimensions: {
    carrierLengthMm: derivedMeasure(
      'caseLengthMm',
      0.1,
      'NATO AOP-4172 Annex A, Sheet 1, case length; bolt-face clearance rounded up to the gun grid',
    ),
    carrierTravelMm: derivedMeasure(
      'caseLengthMm',
      2.5,
      'NATO AOP-4172 Annex A, Sheet 1, case length; the additional stroke margin clears the ejected case',
    ),
    receiverLengthMm: estimatedReceiverMeasure(
      184,
      `Side-profile receiver silhouette in ${receiverPhoto}, scaled by the M4's published extended overall length in ${m4LengthSpecification}; estimated to 16u on the gun grid.`,
    ),
    receiverHeightMm: estimatedReceiverMeasure(
      57.5,
      `Upper receiver silhouette in ${receiverPhoto}, scaled by the M4's published extended overall length in ${m4LengthSpecification}; estimated to 5u on the gun grid.`,
    ),
    ejectionPortLengthMm: derivedMeasure(
      'caseLengthMm',
      1,
      'NATO AOP-4172 Annex A, Sheet 1, case length; end clearance leaves the case free of the port edges',
    ),
    ejectionPortHeightMm: derivedMeasure(
      'maximumHeadDiameterMm',
      1,
      'NATO AOP-4172 Annex A, Sheet 1, case-head diameter; aperture allowance clears the carrier and case',
    ),
    magwellOpeningLengthMm: derivedMeasure(
      'maximumOverallLengthMm',
      1,
      'NATO AOP-4172 Annex A, Sheet 1, maximum cartridge overall length; insertion clearance for the magazine',
    ),
    magwellOpeningWidthMm: derivedMeasure(
      'maximumHeadDiameterMm',
      1.25,
      'NATO AOP-4172 Annex A, Sheet 1, case-head diameter across the double column; wall and insertion allowance',
      { multiplier: 2 },
    ),
    barrelExtensionLengthMm: derivedMeasure(
      'caseLengthMm',
      0.25,
      'NATO AOP-4172 Annex A, Sheet 1, case length; estimated extension depth is half the case length with end clearance',
      { multiplier: 0.5 },
    ),
    barrelExtensionDiameterMm: derivedMeasure(
      'maximumHeadDiameterMm',
      1,
      'NATO AOP-4172 Annex A, Sheet 1, maximum case-head diameter; diametral wall and running allowance',
    ),
  },
};

export const AR_ACTION_FRAMES = [SMALL_AR_FRAME] as const;

const smallFrameSelection = selectFrame(AR_ACTION_FRAMES, SMALL_AR_CARTRIDGE);
if (!smallFrameSelection.ok) {
  throw new Error(smallFrameSelection.issue.message);
}

export const AR_FRAME_BY_CALIBRE: Readonly<Record<string, string>> = {
  [SMALL_AR_CARTRIDGE.id]: smallFrameSelection.frame.id,
};
