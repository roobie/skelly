import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type BlockRead, NOT_LOADED } from './terrainRead.ts';
import type { VehicleInstances } from './vehicleInstances.ts';
import { vehiclePartAt } from './vehicleProjection.ts';

type Table = Readonly<Record<string, string>>;
type Report = (section: 'blocks' | 'furnitureMaterials' | 'items', id: string, path: string, message: string) => void;

export const checkDropSounds = (registry: Registry, report: Report): void => {
  const table = (
    section: Parameters<Report>[0],
    id: string,
    path: string,
    { drops, required = true }: { drops: Table | undefined; required?: boolean },
  ) => {
    if (required && drops?.default === undefined) {
      report(section, id, `${path}.default`, 'missing any-item drop sound');
    }
    for (const [family, event] of Object.entries(drops ?? {})) {
      if (family !== 'default' && !registry.soundFamilies.has(family)) {
        report(section, id, `${path}.${family}`, `no sound family "${family}"`);
      }
      if (!registry.sounds.has(event)) {
        report(section, id, `${path}.${family}`, `no sound event "${event}"`);
      }
    }
  };
  for (const block of registry.blocks) {
    table('blocks', block.id, '.drops', { drops: block.drops, required: block.solid });
  }
  for (const material of registry.furnitureMaterials.values()) {
    table('furnitureMaterials', material.id, '.drops', { drops: material.drops });
  }
  for (const item of registry.items.values()) {
    if (item.soundsLike !== undefined && !registry.soundFamilies.has(item.soundsLike)) {
      report('items', item.id, '.soundsLike', `no sound family "${item.soundsLike}"`);
    }
    if (item.vehicle) {
      table('items', item.id, '.vehicle.drops', { drops: item.vehicle.drops });
    }
  }
};

export interface DropReceiverContext {
  readonly blockIdAt: (x: number, y: number, z: number) => BlockRead;
  readonly entities: BlockEntities;
  readonly vehicles: VehicleInstances;
  readonly blockSize: number;
}

const receiverTable = (registry: Registry, position: Vec3, context: DropReceiverContext): Table | undefined => {
  const cell: Vec3 = [position[0], position[1] - 1, position[2]];
  const id = context.blockIdAt(...cell);
  if (id === NOT_LOADED) {
    return undefined;
  }
  const block = registry.blocks[id];
  if (!block) {
    throw new Error('Pile support block is outside the content registry');
  }
  if (block.solid) {
    return block.drops;
  }
  if (context.entities.isSolid(...cell)) {
    const piece = context.entities.at(...cell)!;
    return registry.furnitureMaterials.get(context.entities.defOf(piece).material)!.drops;
  }
  const part = vehiclePartAt(registry, context.vehicles, context.blockSize, cell);
  return part === undefined ? undefined : registry.items.get(part.item.type)!.vehicle!.drops;
};

export const pileDropSound = (
  registry: Registry,
  itemType: string,
  position: Vec3,
  context: DropReceiverContext,
): string | undefined => {
  if (context.blockIdAt(position[0], position[1] - 1, position[2]) === NOT_LOADED) {
    return undefined;
  }
  const drops = receiverTable(registry, position, context);
  if (drops?.default === undefined) {
    throw new Error('Pile has no admitted drop-sound receiver');
  }
  return familyEntry(registry, itemType, drops) ?? drops.default;
};

/**
 * The receiver's own sound for the item's sound family, or none when the item has no family or the receiver gives that
 * family no sound of its own; a landing that only an any-item drop would voice stays silent.
 */
export const pileFamilySound = (
  registry: Registry,
  itemType: string,
  position: Vec3,
  context: DropReceiverContext,
): string | undefined => {
  const drops = receiverTable(registry, position, context);
  return drops === undefined ? undefined : familyEntry(registry, itemType, drops);
};

const familyEntry = (registry: Registry, itemType: string, drops: Table): string | undefined => {
  const character = registry.items.get(itemType)!.soundsLike;
  return character !== undefined && Object.hasOwn(drops, character) ? drops[character] : undefined;
};
