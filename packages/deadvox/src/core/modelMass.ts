import { modelMassKg } from '@skelly/thing-core/mass';
import type { ModelDef } from './schema.ts';

export const modelBodyMassKg = (model: ModelDef): number => {
  // Baked replaceable geometry is owned by the fitted child item, even when that slot is empty.
  const replaced = new Set([
    ...(model.gun?.attachments ?? []).map((part) => part.node),
    ...Object.values(model.gun?.slots ?? {}).flatMap((slot) => (slot ? [slot.node] : [])),
  ]);
  return modelMassKg({
    parts: Object.fromEntries(
      Object.entries(model.parts).filter(([, part]) => part.node === undefined || !replaced.has(part.node)),
    ),
  });
};
