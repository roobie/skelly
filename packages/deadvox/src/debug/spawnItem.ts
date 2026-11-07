import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { ItemFactory } from '../core/items.ts';
import { putDownRefusal } from '../core/itemThrow.ts';
import { freshDropTarget } from '../core/options.ts';

export const spawnDebugItem = (inventory: Inventory, type: string, feet: Vec3): string => {
  const preview = new ItemFactory().create(inventory.registry, type);
  const target = freshDropTarget(inventory, preview, feet);
  const refusal = putDownRefusal(inventory, preview, target);
  if (refusal) {
    return refusal;
  }
  const item = inventory.create(type);
  if (!inventory.add(item, target!)) {
    throw new Error('Admitted debug spawn did not fit');
  }
  return `Spawned ${inventory.name(item)}`;
};
