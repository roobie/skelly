import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { MeleeMotion } from './meleeMotion.ts';
import type { SolidAt } from './raycast.ts';
import type { VehicleInstances } from './vehicleInstances.ts';
import { type VehicleObstructionChannel, VehicleOccupancy } from './vehicleProjection.ts';
import type { World } from './world.ts';

/** Solid terrain blocks alone, for checks that track furniture themselves. */
export const terrainSolid =
  (world: World, registry: Registry): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    return block !== 0 && registry.blocks[block]!.solid;
  };

interface VehicleCollisionOptions {
  readonly vehicles?: VehicleInstances;
  readonly blockSize?: number;
}

const vehicleChannel = (
  registry: Registry,
  { vehicles, blockSize = 1 }: VehicleCollisionOptions,
  channel: VehicleObstructionChannel,
): VehicleOccupancy | undefined => vehicles && new VehicleOccupancy(registry, vehicles, blockSize, channel);

/** Physical blockers, including closed doors/furniture and occupied parked-vehicle cells. */
export const worldSolid = (
  world: World,
  registry: Registry,
  entities: BlockEntities,
  { vehicles, blockSize = 1 }: VehicleCollisionOptions = {},
): SolidAt => {
  const terrain = terrainSolid(world, registry);
  const occupancy = vehicles ? new VehicleOccupancy(registry, vehicles, blockSize) : undefined;
  return (x, y, z) => terrain(x, y, z) || entities.isSolid(x, y, z) || occupancy?.isSolid(x, y, z) === true;
};

/** Sight blockers. Foliage can hide actors without stopping their bodies or sounds. */
export const worldOpaque =
  (world: World, registry: Registry, entities: BlockEntities, options: VehicleCollisionOptions = {}): SolidAt => {
    const vehicles = vehicleChannel(registry, options, 'sight');
    return (x, y, z) => {
      const block = world.getBlock(x, y, z);
      const definition = registry.blocks[block];
      return (block !== 0 && Boolean(definition?.opaque ?? definition?.solid)) || entities.isSolid(x, y, z) || vehicles?.isSolid(x, y, z) === true;
    };
  };

export const worldSoundBlocking =
  (
    world: World,
    registry: Registry,
    entities: BlockEntities,
    physical: SolidAt = worldSolid(world, registry, entities),
    options: VehicleCollisionOptions = {},
  ): SolidAt => {
    const vehicles = vehicleChannel(registry, options, 'sound');
    const occupied = options.vehicles && new VehicleOccupancy(registry, options.vehicles, options.blockSize ?? 1);
    return (x, y, z) => {
      if (occupied?.isSolid(x, y, z)) {
        return vehicles?.isSolid(x, y, z) === true;
      }
      const definition = registry.blocks[world.getBlock(x, y, z)];
      return (definition?.soundBlocking ?? physical(x, y, z)) || entities.isSolid(x, y, z);
    };
  };

type MeleePassAttack = { motion: MeleeMotion } & ({ kind: 'player' } | { kind: 'zombie'; reachMetres: number });
export type MeleeBlocker = (attack: MeleePassAttack) => SolidAt;

export const worldMeleeBlocker =
  (
    world: World,
    registry: Registry,
    entities: BlockEntities,
    physical: SolidAt = worldSolid(world, registry, entities),
    options: VehicleCollisionOptions = {},
  ): MeleeBlocker => {
    const vehicles = vehicleChannel(registry, options, 'combat');
    const occupied = options.vehicles && new VehicleOccupancy(registry, options.vehicles, options.blockSize ?? 1);
    return (attack) => (x, y, z) => {
      if (entities.isSolid(x, y, z) || vehicles?.isSolid(x, y, z)) {
        return true;
      }
      if (occupied?.isSolid(x, y, z)) {
        return false;
      }
      const definition = registry.blocks[world.getBlock(x, y, z)];
      const pass = definition?.meleePass;
      const blocked = physical(x, y, z);
      if (!(pass && blocked)) {
        return blocked;
      }
      return (
        !pass.motions.includes(attack.motion) ||
        (attack.kind === 'zombie' && attack.reachMetres < pass.minimumZombieReachMetres)
      );
    };
  };
