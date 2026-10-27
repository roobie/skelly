import { attachmentFrame } from './attachmentFrame.ts';
import type { ModelDef, Registry } from './content.ts';
import { defOf, type Item } from './items.ts';
import { add, normalize, rotateVector } from './spatial.ts';

export const sightedFirearmModel = (registry: Registry, item: Item): ModelDef | undefined => {
  const modelId = defOf(registry, item.type).model;
  const model = modelId === undefined ? undefined : registry.models.get(modelId);
  if (!model) {
    return undefined;
  }
  for (const [slotId, child] of Object.entries(item.slots ?? {})) {
    const childModel = child && defOf(registry, child.type).model;
    const attachment = childModel && registry.models.get(childModel)?.gun?.attachment;
    const slot = model.gun?.attachmentSlots?.find(({ id }) => id === slotId);
    if (!(slot && attachment && attachment.kind === 'optic' && attachment.sight)) {
      continue;
    }
    const { sight } = attachment;
    // Sight and visible geometry must cross the same connector-frame boundary.
    const seat = attachmentFrame({
      at: slot.position,
      direction: slot.direction,
      up: slot.up,
      mountFrame: attachment.mountFrame,
    });
    return {
      ...model,
      gun: {
        ...model.gun,
        sight: {
          ...sight,
          eye: add(rotateVector(seat.rotation, sight.eye), seat.at),
          direction: normalize(rotateVector(seat.rotation, sight.direction)),
          up: normalize(rotateVector(seat.rotation, sight.up)),
        },
      },
    };
  }
  return model;
};
