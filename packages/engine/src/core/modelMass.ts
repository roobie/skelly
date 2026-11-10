import { modelMassKg } from '@skelly/thing-core/mass';
import type { ModelDef } from './schema.ts';

export const modelBodyMassKg = (model: ModelDef): number => {
  const { parts } = model;
  if (parts === undefined) {
    throw new Error(`Atom model ${model.id} has no assembly parts`);
  }
  // Baked replaceable geometry is owned by the fitted child item, even when that slot is empty.
  const replaced = new Set([
    ...(model.gun?.attachments ?? []).map((part) => part.node),
    ...Object.values(model.gun?.slots ?? {}).flatMap((slot) => (slot ? [slot.node] : [])),
  ]);
  return modelMassKg({
    parts: Object.fromEntries(
      Object.entries(parts).filter(([, part]) => part.node === undefined || !replaced.has(part.node)),
    ),
  });
};
