import { GRID } from '@skelly/engine/foundation/conventions.ts';
import {
  array,
  finite,
  getDotPath,
  type InferOutput,
  integer,
  minLength,
  minValue,
  nonEmpty,
  number,
  optional,
  picklist,
  pipe,
  safeParse,
  strictObject,
  string,
  unknown,
} from 'valibot';
import { parseCartridge } from '../ammo/parseCartridge.ts';
import {
  type ActionFrame,
  type CartridgeFrameMeasures,
  type FrameMeasure,
  selectFrame,
  validateActionFrames,
} from './actionFrame.ts';
import frameContent from './arFrames.json' with { type: 'json' };
import { GUN_UNITS } from './units.ts';

const mmPerUnit = GUN_UNITS.metresPerUnit * 1000;

const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const Finite = pipe(number(), finite());
const Text = pipe(string(), nonEmpty());
const SNAPS = ['none', 'grid', 'half-grid'] as const;
type Snap = (typeof SNAPS)[number];

const DerivationSchema = strictObject({
  measure: picklist(['maximumOverallLengthMm', 'maximumHeadDiameterMm', 'caseLengthMm']),
  clearanceUnits: Positive,
  snap: picklist(SNAPS),
  description: Text,
  multiplier: optional(Positive),
});
type FrameDerivation = InferOutput<typeof DerivationSchema>;

const FrameSchema = strictObject({
  id: Text,
  rank: pipe(number(), integer(), minValue(0)),
  // Checked by the cartridge parser below, which owns the cartridge format.
  cartridge: unknown(),
  receiver: strictObject({
    photo: Text,
    scale: Text,
    lengthUnits: Positive,
    heightUnits: Positive,
    belowBoreUnits: Positive,
    ejectionPortLengthUnits: optional(Positive),
    ejectionPortCenterX: optional(Finite),
  }),
  cyclicRpm: Positive,
  magazineProfile: Text,
  lower: optional(
    strictObject({
      rearX: Finite,
      wellCenterX: Finite,
      gripX: Finite,
      fingerBottomU: Finite,
      housingFrontBottomU: Finite,
      housingRearBottomU: Finite,
      halfWidthU: Positive,
    }),
  ),
  freeFloatHandguard: optional(strictObject({ lengthU: Positive, topU: Positive })),
  carrier: optional(strictObject({ bottomU: Finite, topU: Finite, lengthU: Positive })),
});
type FrameSource = InferOutput<typeof FrameSchema>;

const ContentSchema = strictObject({
  derivations: strictObject({
    fitMaximumOverallLength: DerivationSchema,
    fitMaximumHeadDiameter: DerivationSchema,
    carrierLength: DerivationSchema,
    carrierTravel: DerivationSchema,
    ejectionPortLength: DerivationSchema,
    ejectionPortHeight: DerivationSchema,
    magwellOpeningLength: DerivationSchema,
    magwellOpeningWidth: DerivationSchema,
    barrelExtensionLength: DerivationSchema,
    barrelExtensionDiameter: DerivationSchema,
  }),
  frames: pipe(array(FrameSchema), minLength(1)),
});
type Derivations = InferOutput<typeof ContentSchema>['derivations'];

interface FrameCartridge {
  readonly measures: CartridgeFrameMeasures;
  readonly sourceTitle: string;
}

const frameCartridge = (frameId: string, document: unknown): FrameCartridge => {
  const parsed = parseCartridge(document);
  if (!parsed.ok) {
    throw new Error(
      `AR frame "${frameId}" cartridge is not a cartridge document: ${parsed.error.path} ${parsed.error.message}`,
    );
  }
  const { cartridge } = parsed;
  if (cartridge.kind !== 'metallic') {
    throw new Error(`AR frame "${frameId}" needs a metallic cartridge, not "${cartridge.id}".`);
  }
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
    throw new Error(
      `AR frame "${frameId}" needs cartridge "${cartridge.id}" to source its overall length, case length and case-head diameters.`,
    );
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

/**
 * A traced ejection port replaces the cartridge-derived length but keeps its clearance basis, so it may only be
 * longer than the case needs.
 */
const tracedPortLength = (source: FrameSource, derivedLength: FrameMeasure): FrameMeasure => {
  const units = source.receiver.ejectionPortLengthUnits;
  if (units === undefined) {
    return derivedLength;
  }
  if (units * mmPerUnit < derivedLength.value) {
    throw new Error(
      `AR frame "${source.id}" traces a ${units}u ejection port, shorter than its cartridge's ${derivedLength.value} mm.`,
    );
  }
  return { ...derivedLength, ...receiverEstimate(source, 'ejection port length', units) };
};

const receiverEstimate = (
  source: FrameSource,
  measure: 'length' | 'height' | 'depth below the bore' | 'ejection port length',
  units: number,
): FrameMeasure => ({
  value: units * mmPerUnit,
  evidence: {
    kind: 'estimate',
    method: `Receiver ${measure} from the side-profile silhouette in ${source.receiver.photo}, scaled by ${source.receiver.scale}; estimated to ${units}u on the gun grid.`,
  },
});

const arFrame = (source: FrameSource, cartridge: FrameCartridge, derivations: Derivations): ActionFrame => {
  const derived = (key: keyof Derivations): FrameMeasure => derivedMeasure(cartridge, derivations[key]);
  return {
    id: source.id,
    rank: source.rank,
    fit: {
      maximumOverallLengthMm: derived('fitMaximumOverallLength'),
      maximumHeadDiameterMm: derived('fitMaximumHeadDiameter'),
    },
    dimensions: {
      carrierLengthMm: derived('carrierLength'),
      carrierTravelMm: derived('carrierTravel'),
      receiverLengthMm: receiverEstimate(source, 'length', source.receiver.lengthUnits),
      receiverHeightMm: receiverEstimate(source, 'height', source.receiver.heightUnits),
      receiverBelowBoreMm: receiverEstimate(source, 'depth below the bore', source.receiver.belowBoreUnits),
      ejectionPortLengthMm: tracedPortLength(source, derived('ejectionPortLength')),
      ejectionPortHeightMm: derived('ejectionPortHeight'),
      magwellOpeningLengthMm: derived('magwellOpeningLength'),
      magwellOpeningWidthMm: derived('magwellOpeningWidth'),
      barrelExtensionLengthMm: derived('barrelExtensionLength'),
      barrelExtensionDiameterMm: derived('barrelExtensionDiameter'),
    },
  };
};

export interface AuthoredARFrame {
  readonly frame: ActionFrame;
  /** The frame's own cartridge, which its measures are derived from. */
  readonly cartridge: CartridgeFrameMeasures;
  readonly cyclicRpm: number;
  readonly magazineProfile: string;
  readonly lower: ARLowerProportions | undefined;
  readonly freeFloatHandguard: FrameSource['freeFloatHandguard'];
  readonly carrier: FrameSource['carrier'];
  readonly ejectionPortCenterX: number | undefined;
}

/**
 * A frame's lower traced from its reference photo, in u from the receiver's front face (x) and the bore (y):
 * the lower's rear, the magazine well's centre, the grip's mount, the trigger finger's bottom, the
 * magazine housing's bottom at its front and rear, and the lower's half width. A frame without one keeps the
 * family's.
 */
export type ARLowerProportions = NonNullable<FrameSource['lower']>;

/** Checks the authored frame content; a malformed frame is a build error naming the frame and field. */
export const loadArFrames = (raw: unknown): readonly AuthoredARFrame[] => {
  const parsed = safeParse(ContentSchema, raw);
  if (!parsed.success) {
    throw new Error(
      `AR frame content: ${parsed.issues.map((issue) => `${getDotPath(issue) ?? '(root)'}: ${issue.message}`).join('; ')}`,
    );
  }
  const { derivations, frames } = parsed.output;
  const authored = frames.map((source) => {
    const cartridge = frameCartridge(source.id, source.cartridge);
    return {
      frame: arFrame(source, cartridge, derivations),
      cartridge: cartridge.measures,
      cyclicRpm: source.cyclicRpm,
      magazineProfile: source.magazineProfile,
      lower: source.lower,
      freeFloatHandguard: source.freeFloatHandguard,
      carrier: source.carrier,
      ejectionPortCenterX: source.receiver.ejectionPortCenterX,
    };
  });
  const issues = validateActionFrames(authored.map(({ frame }) => frame));
  if (issues.length > 0) {
    throw new Error(`AR frame content: ${issues.map(({ message }) => message).join('; ')}`);
  }
  return [...authored].sort((left, right) => left.frame.rank - right.frame.rank);
};

const authored = loadArFrames(frameContent);

/** Every authored AR frame, lowest rank first. */
export const AR_ACTION_FRAMES: readonly ActionFrame[] = authored.map(({ frame }) => frame);

/** Each frame's automatic cyclic rate, in rounds per minute. */
export const AR_CYCLIC_RPM: Readonly<Record<string, number>> = Object.fromEntries(
  authored.map(({ frame, cyclicRpm }) => [frame.id, cyclicRpm]),
);

// The lowest-ranked frame is the family's reference: parts that name no frame build to it.
const [reference] = authored;
if (reference === undefined) {
  throw new Error('AR frame content has no frame.');
}
export const SMALL_AR_FRAME: ActionFrame = reference.frame;
export const SMALL_AR_CARTRIDGE: CartridgeFrameMeasures = reference.cartridge;

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

const magazineProfileOf = (frameId: string): string =>
  authored.find(({ frame }) => frame.id === frameId)?.magazineProfile ?? reference.magazineProfile;

/** The magazine profile each calibre seats: the one its selected frame's well takes. */
export const AR_MAGAZINE_PROFILE_BY_CALIBRE: Readonly<Record<string, string>> = Object.fromEntries(
  AR_FRAMES_BY_CALIBRE.map(({ cartridge, frame }) => [cartridge.id, magazineProfileOf(frame.id)]),
);

/** Each frame's traced lower, where its content has one. */
export const AR_LOWER_PROPORTIONS: Readonly<Record<string, ARLowerProportions | undefined>> = Object.fromEntries(
  authored.map(({ frame, lower }) => [frame.id, lower]),
);

/**
 * Each frame's bolt carrier body, its bottom and top above the bore and its full-height length back from the bolt
 * face (never shorter than the cartridge-derived carrier), where its content sets one; a frame without one keeps
 * the family's carrier.
 */
export const AR_CARRIER_HEIGHTS: Readonly<Record<string, AuthoredARFrame['carrier']>> = Object.fromEntries(
  authored.map(({ frame, carrier }) => [frame.id, carrier]),
);

/**
 * Each frame's traced ejection port centre, x from the receiver's front face, where its content sets one; a frame
 * without one centres its port on the bolt carrier's body.
 */
export const AR_EJECTION_PORT_CENTERS: Readonly<Record<string, number | undefined>> = Object.fromEntries(
  authored.map(({ frame, ejectionPortCenterX }) => [frame.id, ejectionPortCenterX]),
);

/**
 * Each frame's traced free-float rail, where its content has one: its length from the receiver's front face and
 * its top rail's height above the bore. A frame without one keeps the family's reach and the tube's own height.
 */
export const AR_FREE_FLOAT_HANDGUARDS: Readonly<Record<string, AuthoredARFrame['freeFloatHandguard']>> =
  Object.fromEntries(authored.map(({ frame, freeFloatHandguard }) => [frame.id, freeFloatHandguard]));

/** Every magazine profile an AR frame takes. */
export const AR_MAGAZINE_PROFILES: readonly string[] = [
  ...new Set(authored.map(({ magazineProfile }) => magazineProfile)),
];
