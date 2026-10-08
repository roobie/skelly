// Dynamic attachment admission uses only gungen's certificates and exported rail-notch footprints.
import type { ModelDef, Registry } from './content.ts';
import type { Item } from './items.ts';

export type AttachmentChoice = readonly [slotId: string, attachmentId: string];

const compareChoice = (a: AttachmentChoice, b: AttachmentChoice): number =>
  a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]);

const canonicalPair = (a: AttachmentChoice, b: AttachmentChoice): readonly [AttachmentChoice, AttachmentChoice] =>
  compareChoice(a, b) <= 0 ? [a, b] : [b, a];

export const attachmentIdFor = (registry: Registry, item: Item): string | undefined => {
  const modelId = registry.items.get(item.type)?.model;
  return modelId === undefined ? undefined : registry.models.get(modelId)?.attachment?.id;
};

/** Whether the exported model certifies these two installed attachment choices together. */
export const compatibilityPairCertifies = (
  model: ModelDef | undefined,
  a: AttachmentChoice,
  b: AttachmentChoice,
): boolean => {
  if (!model) {
    return false;
  }
  const expected = canonicalPair(a, b);
  const pairs = model.compatibilityPairs;
  return (
    pairs?.some((pair) => {
      const actual = canonicalPair(pair[0], pair[1]);
      return compareChoice(actual[0], expected[0]) === 0 && compareChoice(actual[1], expected[1]) === 0;
    }) ?? false
  );
};

export const isExportedSingleFit = (
  model: ModelDef | undefined,
  slotId: string,
  attachmentId: string | undefined,
): boolean => Boolean(attachmentId && model?.compatibility?.[slotId]?.includes(attachmentId));

export const railFootprint = (
  registry: Registry,
  firearmModel: ModelDef | undefined,
  slotId: string,
  child: Item,
): { railId: string; min: number; max: number } | undefined => {
  const slot = firearmModel?.attachmentSlots?.find(({ id }) => id === slotId);
  const attachmentModelId = registry.items.get(child.type)?.model;
  const attachment = attachmentModelId === undefined ? undefined : registry.models.get(attachmentModelId)?.attachment;
  const span = attachment?.properties.railSpanNotches;
  if (!(slot?.railId && slot.notchIndex !== undefined && span)) {
    return undefined;
  }
  return { railId: slot.railId, min: slot.notchIndex + span.minOffset, max: slot.notchIndex + span.maxOffset };
};

/** A rail footprint is valid only when all exported notch cells exist on that rail. */
export const footprintFitsRail = (
  firearmModel: ModelDef | undefined,
  footprint: { railId: string; min: number; max: number },
): boolean => {
  const notches = new Set(
    firearmModel?.attachmentSlots
      ?.filter((slot) => slot.railId === footprint.railId)
      .map((slot) => slot.notchIndex)
      .filter((notch): notch is number => notch !== undefined),
  );
  for (let notch = footprint.min; notch <= footprint.max; notch += 1) {
    if (!notches.has(notch)) {
      return false;
    }
  }
  return true;
};

export const railFootprintsOverlap = (
  a: { railId: string; min: number; max: number },
  b: { railId: string; min: number; max: number },
): boolean => a.railId === b.railId && a.min <= b.max && b.min <= a.max;
