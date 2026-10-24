import { GRID } from '@skelly/engine/foundation/conventions.ts';
import cartridge556Json from '../../cartridges/5.56x45.json' with { type: 'json' };
import cartridge762Json from '../../cartridges/7.62x51.json' with { type: 'json' };
import { parseCartridge } from '../ammo/parseCartridge.ts';
import {
  type ActionFrame,
  AR_FRAME_RANKS,
  type CartridgeClearanceMeasure,
  type CartridgeFrameMeasures,
  type FrameMeasure,
  selectFrame,
} from './actionFrame.ts';
import frameContent from './arFrames.json' with { type: 'json' };
import { GUN_UNITS } from './units.ts';

const mmPerUnit = GUN_UNITS.metresPerUnit * 1000;

const CARTRIDGE_FILES: Readonly<Record<string, unknown>> = {
  '5.56x45': cartridge556Json,
  '7.62x51': cartridge762Json,
};

interface FrameCartridge {
  readonly measures: CartridgeFrameMeasures;
  readonly sourceTitle: string;
}

const frameCartridge = (id: string): FrameCartridge => {
  const parsed = parseCartridge(CARTRIDGE_FILES[id]);
  if (!parsed.ok || parsed.cartridge.kind !== 'metallic') {
    throw new Error(`An AR frame requires sourced metallic cartridge data for "${id}".`);
  }
  const { cartridge } = parsed;
  const maximumOverallLengthMm = cartridge.overallLength.max.value;
  const caseLengthMm = cartridge.case.length.value;
  const rimDiameterMm = cartridge.case.rim.diameter.value;
  const bodyHeadDiameterMm = cartridge.case.body.diameterAtHead.value;
  const source = cartridge.sources[cartridge.primarySource];
  if (
    maximumOverallLengthMm === null ||
    caseLengthMm === null ||
    rimDiameterMm === null ||
    bodyHeadDiameterMm === null ||
    source === undefined
  ) {
    throw new Error(`The AR frame for "${id}" requires sourced overall-length, case-length and case-head measures.`);
  }
  return {
    measures: {
      id: cartridge.id,
      maximumOverallLengthMm,
      maximumHeadDiameterMm: Math.max(rimDiameterMm, bodyHeadDiameterMm),
      caseLengthMm,
    },
    sourceTitle: source.title,
  };
};

type Snap = 'none' | 'grid' | 'half-grid';

interface FrameDerivation {
  readonly measure: CartridgeClearanceMeasure;
  readonly clearanceUnits: number;
  readonly snap: Snap;
  readonly description: string;
  readonly multiplier?: number;
}

const SNAP_UNITS: Readonly<Record<Snap, number | undefined>> = { none: undefined, grid: GRID, 'half-grid': 0.5 };
const SNAP_METHOD: Readonly<Record<Snap, string>> = {
  none: '',
  grid: ', rounded up to the gun grid',
  'half-grid': ', rounded up to the gun grid half-step, since the parts build halves this measure',
};

const derivedMeasure = (cartridge: FrameCartridge, derivation: FrameDerivation): FrameMeasure => {
  const sourceValue = cartridge.measures[derivation.measure];
  if (sourceValue === null) {
    throw new Error(`The AR frame for "${cartridge.measures.id}" requires sourced ${derivation.measure}.`);
  }
  const clearance = derivation.clearanceUnits * mmPerUnit;
  const minimum = sourceValue * (derivation.multiplier ?? 1) + clearance;
  const snapUnits = SNAP_UNITS[derivation.snap];
  return {
    value:
      snapUnits === undefined ? minimum : Math.ceil(minimum / mmPerUnit / snapUnits - 1e-9) * snapUnits * mmPerUnit,
    evidence: {
      kind: 'estimate',
      method: `Derived from cartridges/${cartridge.measures.id}.json (${cartridge.sourceTitle}, ${derivation.description}) plus ${derivation.clearanceUnits}u (${clearance} mm) clearance${SNAP_METHOD[derivation.snap]}.`,
    },
    cartridgeClearance: {
      measure: derivation.measure,
      ...(derivation.multiplier === undefined ? {} : { multiplier: derivation.multiplier }),
      clearanceMm: clearance,
    },
  };
};

interface FrameSource {
  readonly id: keyof typeof AR_FRAME_RANKS;
  readonly cartridge: string;
  readonly receiver: {
    readonly photo: string;
    readonly overallLength: string;
    readonly lengthUnits: number;
    readonly heightUnits: number;
  };
  readonly cyclicRpm: number;
}

const derivations = frameContent.derivations as Readonly<
  Record<keyof typeof frameContent.derivations, FrameDerivation>
>;

const receiverEstimate = (source: FrameSource, measure: 'length' | 'height', units: number): FrameMeasure => ({
  value: units * mmPerUnit,
  evidence: {
    kind: 'estimate',
    method: `Receiver ${measure} from the side-profile silhouette in ${source.receiver.photo}, scaled by the rifle's published overall length in ${source.receiver.overallLength}; estimated to ${units}u on the gun grid.`,
  },
});

const arFrame = (source: FrameSource): { readonly cartridge: CartridgeFrameMeasures; readonly frame: ActionFrame } => {
  const cartridge = frameCartridge(source.cartridge);
  const derived = (key: keyof typeof derivations): FrameMeasure => derivedMeasure(cartridge, derivations[key]);
  return {
    cartridge: cartridge.measures,
    frame: {
      id: source.id,
      rank: AR_FRAME_RANKS[source.id],
      fit: {
        maximumOverallLengthMm: derived('fitMaximumOverallLength'),
        maximumHeadDiameterMm: derived('fitMaximumHeadDiameter'),
      },
      dimensions: {
        carrierLengthMm: derived('carrierLength'),
        carrierTravelMm: derived('carrierTravel'),
        receiverLengthMm: receiverEstimate(source, 'length', source.receiver.lengthUnits),
        receiverHeightMm: receiverEstimate(source, 'height', source.receiver.heightUnits),
        ejectionPortLengthMm: derived('ejectionPortLength'),
        ejectionPortHeightMm: derived('ejectionPortHeight'),
        magwellOpeningLengthMm: derived('magwellOpeningLength'),
        magwellOpeningWidthMm: derived('magwellOpeningWidth'),
        barrelExtensionLengthMm: derived('barrelExtensionLength'),
        barrelExtensionDiameterMm: derived('barrelExtensionDiameter'),
      },
    },
  };
};

const frameSources = frameContent.frames as readonly FrameSource[];
const authored = frameSources.map(arFrame);

/** Each frame's automatic cyclic rate, in rounds per minute. */
export const AR_CYCLIC_RPM: Readonly<Record<string, number>> = Object.fromEntries(
  frameSources.map(({ id, cyclicRpm }) => [id, cyclicRpm]),
);

export const AR_ACTION_FRAMES: readonly ActionFrame[] = authored.map(({ frame }) => frame);

const authoredFrame = (id: keyof typeof AR_FRAME_RANKS) => {
  const entry = authored.find(({ frame }) => frame.id === id);
  if (entry === undefined) {
    throw new Error(`The AR frame content has no "${id}" frame.`);
  }
  return entry;
};

export const SMALL_AR_FRAME: ActionFrame = authoredFrame('small').frame;
export const SMALL_AR_CARTRIDGE: CartridgeFrameMeasures = authoredFrame('small').cartridge;

/** Each frame's own cartridge with the frame the rank selector picks for it, which need not be that frame. */
export const AR_FRAMES_BY_CALIBRE: readonly {
  readonly cartridge: CartridgeFrameMeasures;
  readonly frame: ActionFrame;
}[] = authored.map(({ cartridge }) => {
  const selection = selectFrame(AR_ACTION_FRAMES, cartridge);
  if (!selection.ok) {
    throw new Error(selection.issue.message);
  }
  return { cartridge, frame: selection.frame };
});

export const AR_FRAME_BY_CALIBRE: Readonly<Record<string, string>> = Object.fromEntries(
  AR_FRAMES_BY_CALIBRE.map(({ cartridge, frame }) => [cartridge.id, frame.id]),
);
