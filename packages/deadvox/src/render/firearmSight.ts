import { Vector3 } from 'three';
import type { ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { defOf, type Item } from '../core/items.ts';
import { itemLook } from './itemLook.ts';
import { fittedPartFrame } from './models.ts';

export const sightedFirearmModel = (registry: Registry, item: Item): ModelDef | undefined => {
  const modelId = defOf(registry, item.type).model;
  const model = modelId === undefined ? undefined : registry.models.get(modelId);
  if (!model) {
    return undefined;
  }
  for (const slot of itemLook(registry, item)?.slots ?? []) {
    const attachment = slot.model === undefined ? undefined : registry.models.get(slot.model)?.gun?.attachment;
    if (attachment?.kind !== 'optic' || !attachment.sight) {
      continue;
    }
    const { sight } = attachment;
    // Sight and visible geometry must cross the same connector-frame boundary.
    const seat = fittedPartFrame(slot);
    seat.updateMatrix();
    return {
      ...model,
      gun: {
        ...model.gun,
        sight: {
          ...sight,
          eye: new Vector3(...sight.eye).applyMatrix4(seat.matrix).toArray() as Vec3,
          direction: new Vector3(...sight.direction).transformDirection(seat.matrix).toArray() as Vec3,
          up: new Vector3(...sight.up).transformDirection(seat.matrix).toArray() as Vec3,
        },
      },
    };
  }
  return model;
};
