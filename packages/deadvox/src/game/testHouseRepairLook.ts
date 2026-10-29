import repairLook from '../config/repair-look.json' with { type: 'json' };
import type { BlockEntity } from '../core/blockEntities.ts';
import { toChunk, type Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { slotProps } from '../core/showroom.ts';
import type { Site } from '../core/site.ts';
import type { GameConfig } from './config.ts';
import type { Input } from './input.ts';

export const faceRepairLookTarget = (
  input: Pick<Input, 'pitch' | 'adjustPitch'>,
  origin: Vec3,
  target?: BlockEntity,
): void => {
  if (!target) {
    return;
  }
  const centre = target.pos.map((value, axis) => value + target.size[axis]! / 2);
  input.adjustPitch(
    Math.atan2(centre[1]! - origin[1], Math.hypot(centre[0]! - origin[0], centre[2]! - origin[2])) - input.pitch,
  );
};

/** Claim the authored showroom prop before streaming so arrival preserves the staged damage and supplies. */
export const stageRepairLook = (
  inventory: Inventory,
  site: Pick<Site, 'furnitureIn'> | undefined,
  config: Pick<GameConfig, 'debug' | 'site' | 'debugRepairLook'>,
  restoring: boolean,
): BlockEntity | undefined => {
  if (!(config.debug && config.site === 'testHouse' && config.debugRepairLook && site && !restoring)) {
    return undefined;
  }
  const { registry } = inventory;
  const showroom = registry.layouts.get('testHouse')!.showroom!;
  const prop = slotProps(registry, showroom).find(({ furniture }) => furniture === repairLook.furniture);
  if (!prop) {
    throw new Error('Repair look target must occupy a showroom slot');
  }
  const spawn = site
    .furnitureIn(toChunk(prop.pos[0]), toChunk(prop.pos[2]))
    .find(({ spec }) => spec.type === prop.furniture && spec.pos.every((value, axis) => value === prop.pos[axis]));
  const entity = spawn && inventory.furnishSpawn(spawn);
  if (!entity) {
    throw new Error('Repair look showroom prop could not be placed');
  }
  inventory.entities.wear(entity, repairLook.damageFraction);
  inventory.entities.markSearched(entity);
  const recipe = registry.recipes.get(repairLook.recipe)!;
  for (const group of recipe.components) {
    const { item, count } = group[0]!;
    const stock = inventory.create(item, count);
    if (!(entity.pockets ?? []).some((_, pocket) => inventory.add(stock, { kind: 'furniture', entity, pocket }))) {
      throw new Error('Repair look supplies did not fit');
    }
  }
  return entity;
};
