import { GRID } from '@skelly/engine/foundation/conventions.ts';
import { AR_ACTION_FRAMES, SMALL_AR_FRAME } from './arFrames.ts';
import { GUN_UNITS } from './units.ts';

const mmPerUnit = GUN_UNITS.metresPerUnit * 1000;
const units = (mm: number): number => Math.ceil(mm / mmPerUnit / GRID - 1e-9) * GRID;

export interface ARActionLayout {
  readonly frameId: string;
  readonly receiverLengthU: number;
  readonly receiverHeightU: number;
  readonly barrelExtensionLengthU: number;
  readonly barrelExtensionDiameterU: number;
  readonly carrierFaceLengthU: number;
  readonly carrierTravelU: number;
  readonly ejectionPortLengthU: number;
  readonly ejectionPortHeightU: number;
  readonly magwellOpeningLengthU: number;
  readonly magwellOpeningWidthU: number;
}

const layoutForFrame = ({ id, dimensions }: (typeof AR_ACTION_FRAMES)[number]): ARActionLayout => ({
  frameId: id,
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
});

export const AR_ACTION_LAYOUTS: Readonly<Record<string, ARActionLayout>> = Object.fromEntries(
  AR_ACTION_FRAMES.map((frame) => [frame.id, layoutForFrame(frame)]),
);

/** The small frame's layout; the family's reference shape. */
export const AR_ACTION_LAYOUT = AR_ACTION_LAYOUTS[SMALL_AR_FRAME.id]!;

/**
 * The layout a part resolves for its frame id; an unset id is the receiver `actionFrame` param's
 * small-frame default, and a set but unknown id is a build error, not a silent shape change.
 */
export const arLayoutFor = (frameId: string | undefined): ARActionLayout => {
  if (frameId === undefined) {
    return AR_ACTION_LAYOUT;
  }
  const layout = AR_ACTION_LAYOUTS[frameId];
  if (layout === undefined) {
    throw new Error(
      `AR part names unknown action frame "${frameId}"; known frames: ${Object.keys(AR_ACTION_LAYOUTS).join(', ')}.`,
    );
  }
  return layout;
};
