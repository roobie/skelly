import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
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
  readonly blockIdAt: (x: number, y: number, z: number) => number;
  readonly entities: BlockEntities;
  readonly vehicles: VehicleInstances;
  readonly blockSize: number;
}

const receiverTable = (registry: Registry, position: Vec3, context: DropReceiverContext): Table | undefined => {
  const cell: Vec3 = [position[0], position[1] - 1, position[2]];
  const block = registry.blocks[context.blockIdAt(...cell)];
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
): string => {
  const drops = receiverTable(registry, position, context);
  if (drops?.default === undefined) {
    throw new Error('Pile has no admitted drop-sound receiver');
  }
  const character = registry.items.get(itemType)!.soundsLike;
  return character !== undefined && Object.hasOwn(drops, character) ? drops[character]! : drops.default;
};
