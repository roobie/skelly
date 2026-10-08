export interface FrameMeasure {
  readonly value: number;
  readonly evidence:
    | { readonly kind: 'source'; readonly url: string; readonly locator: string }
    | { readonly kind: 'estimate'; readonly method: string };
}

interface CartridgeFrameFit {
  readonly maximumOverallLengthMm: FrameMeasure;
  readonly maximumHeadDiameterMm: FrameMeasure;
}

interface ActionFrameDimensions {
  readonly carrierLengthMm: FrameMeasure;
  readonly carrierTravelMm: FrameMeasure;
  readonly receiverLengthMm: FrameMeasure;
  readonly receiverHeightMm: FrameMeasure;
  readonly ejectionPortLengthMm: FrameMeasure;
  readonly ejectionPortHeightMm: FrameMeasure;
  readonly magwellOpeningLengthMm: FrameMeasure;
  readonly magwellOpeningWidthMm: FrameMeasure;
  readonly barrelExtensionLengthMm: FrameMeasure;
  readonly barrelExtensionDiameterMm: FrameMeasure;
}

export interface ActionFrame {
  readonly id: string;
  readonly rank: number;
  readonly fit: CartridgeFrameFit;
  readonly dimensions: ActionFrameDimensions;
}

export interface CartridgeFrameMeasures {
  readonly id: string;
  readonly maximumOverallLengthMm: number | null;
  readonly maximumHeadDiameterMm: number | null;
}

export interface ActionFrameIssue {
  readonly rule: 'frame-data' | 'frame-fit';
  readonly message: string;
}

export type FrameSelection =
  | { readonly ok: true; readonly frame: ActionFrame }
  | { readonly ok: false; readonly issue: ActionFrameIssue };

export const AR_FRAME_RANKS = {
  small: 0,
  large: 1,
  magnum: 2,
} as const;

const HTTP_URL = /^https?:\/\//;

const measureIssues = (frameId: string, name: string, measure: FrameMeasure): ActionFrameIssue[] => {
  const path = `frame "${frameId}" ${name}`;
  const issues: ActionFrameIssue[] = [];
  if (!Number.isFinite(measure.value) || measure.value <= 0) {
    issues.push({ rule: 'frame-data', message: `${path} must be a positive finite measure` });
  }
  const { evidence } = measure;
  const hasEvidence =
    evidence.kind === 'source'
      ? HTTP_URL.test(evidence.url) && evidence.locator.trim() !== ''
      : evidence.method.trim() !== '';
  if (!hasEvidence) {
    issues.push({ rule: 'frame-data', message: `${path} needs a source citation or an estimate method` });
  }
  return issues;
};

const frameIssues = (frame: ActionFrame, ids: Set<string>, ranks: Set<number>): ActionFrameIssue[] => {
  const issues: ActionFrameIssue[] = [];
  if (!frame.id.trim() || ids.has(frame.id)) {
    issues.push({ rule: 'frame-data', message: `frame id "${frame.id}" must be non-empty and unique` });
  }
  ids.add(frame.id);
  if (!Number.isInteger(frame.rank) || ranks.has(frame.rank)) {
    issues.push({ rule: 'frame-data', message: `frame "${frame.id}" rank must be a unique integer` });
  }
  ranks.add(frame.rank);
  const measures = [
    ['fit.maximumOverallLengthMm', frame.fit.maximumOverallLengthMm],
    ['fit.maximumHeadDiameterMm', frame.fit.maximumHeadDiameterMm],
    ...Object.entries(frame.dimensions),
  ] as const;
  return [...issues, ...measures.flatMap(([name, measure]) => measureIssues(frame.id, name, measure))];
};

export const validateActionFrames = (frames: readonly ActionFrame[]): ActionFrameIssue[] => {
  const ids = new Set<string>();
  const ranks = new Set<number>();
  return frames.flatMap((frame) => frameIssues(frame, ids, ranks));
};

const frameFits = (frame: ActionFrame, cartridge: CartridgeFrameMeasures): boolean =>
  cartridge.maximumOverallLengthMm !== null &&
  cartridge.maximumHeadDiameterMm !== null &&
  cartridge.maximumOverallLengthMm <= frame.fit.maximumOverallLengthMm.value &&
  cartridge.maximumHeadDiameterMm <= frame.fit.maximumHeadDiameterMm.value;

export const selectFrame = (frames: readonly ActionFrame[], cartridge: CartridgeFrameMeasures): FrameSelection => {
  if (frames.length === 0) {
    return { ok: false, issue: { rule: 'frame-data', message: 'cannot select a frame from an empty family' } };
  }
  const dataIssues = validateActionFrames(frames);
  if (dataIssues.length > 0) {
    return { ok: false, issue: dataIssues[0]! };
  }
  const ranked = [...frames].sort((left, right) => left.rank - right.rank);
  const frame = ranked.find((candidate) => frameFits(candidate, cartridge));
  if (frame) {
    return { ok: true, frame };
  }
  const largest = ranked.at(-1)!;
  const length = cartridge.maximumOverallLengthMm === null ? 'unknown' : `${cartridge.maximumOverallLengthMm} mm`;
  const head = cartridge.maximumHeadDiameterMm === null ? 'unknown' : `${cartridge.maximumHeadDiameterMm} mm`;
  return {
    ok: false,
    issue: {
      rule: 'frame-fit',
      message: `cartridge "${cartridge.id}" (maximum overall length ${length}, maximum case head diameter ${head}) does not fit the largest frame "${largest.id}" (maximum overall length ${largest.fit.maximumOverallLengthMm.value} mm, maximum case head diameter ${largest.fit.maximumHeadDiameterMm.value} mm)`,
    },
  };
};
