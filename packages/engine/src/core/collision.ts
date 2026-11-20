import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import type { MeleeMotion } from './meleeMotion.ts';
import type { SolidAt } from './raycast.ts';
import { type ChunkRead, NOT_LOADED, type TerrainRead } from './terrainRead.ts';
import type { VehicleInstances } from './vehicleInstances.ts';
import { type VehicleObstructionChannel, VehicleOccupancy } from './vehicleProjection.ts';

/** Solid terrain blocks alone, for checks that track furniture themselves. */
export const terrainSolid =
  (world: TerrainRead, registry: Registry): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    return block === NOT_LOADED || (block !== 0 && registry.blocks[block]!.solid);
  };

interface VehicleCollisionOptions {
  readonly vehicles?: VehicleInstances;
  readonly blockSize?: number;
}

interface ChannelCollisionOptions extends VehicleCollisionOptions {
  readonly entities: BlockEntities;
  readonly physical?: SolidAt;
}

const vehicleChannel = (
  registry: Registry,
  { vehicles, blockSize = 1 }: VehicleCollisionOptions,
  channel: VehicleObstructionChannel,
): VehicleOccupancy | undefined => vehicles && new VehicleOccupancy(registry, vehicles, blockSize, channel);

/** Physical blockers, including closed doors/furniture and occupied parked-vehicle cells. */
export const worldSolid = (
  world: TerrainRead,
  registry: Registry,
  entities: BlockEntities,
  { vehicles, blockSize = 1 }: VehicleCollisionOptions = {},
): SolidAt => {
  const terrain = terrainSolid(world, registry);
  const occupancy = vehicles ? new VehicleOccupancy(registry, vehicles, blockSize) : undefined;
  return (x, y, z) => terrain(x, y, z) || entities.isSolid(x, y, z) || occupancy?.isSolid(x, y, z) === true;
};

/** Sight blockers. Foliage can hide actors without stopping their bodies or sounds. */
export const worldOpaque = (
  world: TerrainRead,
  registry: Registry,
  entities: BlockEntities,
  options: VehicleCollisionOptions = {},
): SolidAt => {
  const vehicles = vehicleChannel(registry, options, 'sight');
  return (x, y, z) => {
    const block = world.getBlock(x, y, z);
    if (block === NOT_LOADED) {
      return true;
    }
    const definition = registry.blocks[block];
    return (
      (block !== 0 && Boolean(definition?.opaque ?? definition?.solid)) ||
      entities.obstructs(x, y, z, 'sight') ||
      vehicles?.isSolid(x, y, z) === true
    );
  };
};

export interface LightMemo {
  readonly min: Readonly<Vec3>;
  readonly size: number;
  readonly cells: Uint8Array;
}

/** Bulk filling belongs to the same authority as individual light queries, when its source supports it. */
export type LightBlocking = SolidAt & { fill?: (memo: LightMemo) => void };

const blockLightBox = (
  { min, size, cells }: LightMemo,
  low: Readonly<Vec3>,
  high: Readonly<Vec3>,
  accepts?: SolidAt,
): void => {
  for (let y = Math.max(min[1], Math.floor(low[1])); y < Math.min(min[1] + size, Math.ceil(high[1])); y++) {
    for (let z = Math.max(min[2], Math.floor(low[2])); z < Math.min(min[2] + size, Math.ceil(high[2])); z++) {
      for (let x = Math.max(min[0], Math.floor(low[0])); x < Math.min(min[0] + size, Math.ceil(high[0])); x++) {
        if (accepts && !accepts(x, y, z)) {
          continue;
        }
        cells[x - min[0] + size * (z - min[2] + size * (y - min[1]))] = 2;
      }
    }
  }
};

const fillLightChunk = ({ min, size, cells }: LightMemo, chunk: ChunkRead, origin: Vec3, byId: Uint8Array): void => {
  const known = chunk === NOT_LOADED ? undefined : chunk;
  const raw = known?.raw();
  const uniform = chunk === NOT_LOADED ? 2 : Number(byId[known?.uniformId ?? 0] === 2) + 1;
  const x0 = Math.max(min[0], origin[0]);
  const x1 = Math.min(min[0] + size, origin[0] + CHUNK);
  for (let y = Math.max(min[1], origin[1]); y < Math.min(min[1] + size, origin[1] + CHUNK); y++) {
    for (let z = Math.max(min[2], origin[2]); z < Math.min(min[2] + size, origin[2] + CHUNK); z++) {
      const target = x0 - min[0] + size * (z - min[2] + size * (y - min[1]));
      if (raw) {
        const source = x0 - origin[0] + CHUNK * (z - origin[2] + CHUNK * (y - origin[1]));
        for (let x = 0; x < x1 - x0; x++) {
          cells[target + x] = byId[raw[source + x]!] ?? 1;
        }
      } else {
        cells.fill(uniform, target, target + x1 - x0);
      }
    }
  }
};

const fillLightTerrain = (world: TerrainRead, registry: Registry, memo: LightMemo): void => {
  const byId = Uint8Array.from(registry.blocks, (block, id) => (id !== 0 && (block?.opaque ?? block?.solid) ? 2 : 1));
  const { min, size } = memo;
  for (let cy = Math.floor(min[1] / CHUNK); cy <= Math.floor((min[1] + size - 1) / CHUNK); cy++) {
    for (let cz = Math.floor(min[2] / CHUNK); cz <= Math.floor((min[2] + size - 1) / CHUNK); cz++) {
      for (let cx = Math.floor(min[0] / CHUNK); cx <= Math.floor((min[0] + size - 1) / CHUNK); cx++) {
        fillLightChunk(memo, world.getChunk(cx, cy, cz), [cx * CHUNK, cy * CHUNK, cz * CHUNK], byId);
      }
    }
  }
};

export const withLightVehicles = (light: LightBlocking, vehicles: VehicleOccupancy): LightBlocking => {
  const at: SolidAt = (x, y, z) => light(x, y, z) || vehicles.isSolid(x, y, z);
  const { fill } = light;
  if (!fill) {
    return at;
  }
  return Object.assign(at, {
    fill: (memo: LightMemo): void => {
      fill(memo);
      for (const { min, max } of vehicles.boxes()) {
        blockLightBox(memo, min, max);
      }
    },
  });
};

export const worldLightBlocking = (
  world: TerrainRead,
  registry: Registry,
  entities: BlockEntities,
  options: VehicleCollisionOptions = {},
): LightBlocking => {
  const vehicles = vehicleChannel(registry, options, 'light');
  const at: SolidAt = (x, y, z) => {
    const block = world.getBlock(x, y, z);
    if (block === NOT_LOADED) {
      return true;
    }
    const definition = registry.blocks[block];
    return (
      (block !== 0 && Boolean(definition?.opaque ?? definition?.solid)) ||
      entities.obstructs(x, y, z, 'light') ||
      vehicles?.isSolid(x, y, z) === true
    );
  };
  return Object.assign(at, {
    fill: (memo: LightMemo): void => {
      fillLightTerrain(world, registry, memo);
      for (const entity of entities.all) {
        for (const { pos, size } of entities.lightBlockingBoxes(entity)) {
          // Candidate boxes avoid querying empty air; the obstruction owner still decides each occupied cell.
          blockLightBox(memo, pos, pos.map((value, axis) => value + size[axis]!) as Vec3, (x, y, z) =>
            entities.obstructs(x, y, z, 'light'),
          );
        }
      }
      for (const { min, max } of vehicles?.boxes() ?? []) {
        blockLightBox(memo, min, max);
      }
    },
  });
};

export const worldSoundBlocking = (
  world: TerrainRead,
  registry: Registry,
  options: ChannelCollisionOptions,
): SolidAt => {
  const { entities, physical = worldSolid(world, registry, entities) } = options;
  const vehicles = vehicleChannel(registry, options, 'sound');
  const occupied = options.vehicles && new VehicleOccupancy(registry, options.vehicles, options.blockSize ?? 1);
  return (x, y, z) => {
    const block = world.getBlock(x, y, z);
    if (block === NOT_LOADED) {
      return true;
    }
    if (occupied?.isSolid(x, y, z)) {
      return vehicles?.isSolid(x, y, z) === true;
    }
    const definition = registry.blocks[block];
    return (definition?.soundBlocking ?? physical(x, y, z)) || entities.isSolid(x, y, z);
  };
};

type MeleePassAttack = { motion: MeleeMotion } & ({ kind: 'player' } | { kind: 'actor'; reachMetres: number });
export type MeleeBlocker = (attack: MeleePassAttack) => SolidAt;

export const worldMeleeBlocker = (
  world: TerrainRead,
  registry: Registry,
  options: ChannelCollisionOptions,
): MeleeBlocker => {
  const { entities, physical = worldSolid(world, registry, entities) } = options;
  const vehicles = vehicleChannel(registry, options, 'combat');
  const occupied = options.vehicles && new VehicleOccupancy(registry, options.vehicles, options.blockSize ?? 1);
  return (attack) => (x, y, z) => {
    const block = world.getBlock(x, y, z);
    if (block === NOT_LOADED || entities.isSolid(x, y, z) || vehicles?.isSolid(x, y, z)) {
      return true;
    }
    if (occupied?.isSolid(x, y, z)) {
      return false;
    }
    const definition = registry.blocks[block];
    const pass = definition?.meleePass;
    const blocked = physical(x, y, z);
    if (!(pass && blocked)) {
      return blocked;
    }
    return (
      !pass.motions.includes(attack.motion) ||
      (attack.kind === 'actor' && attack.reachMetres < pass.minimumActorReachMetres)
    );
  };
};
