// What stands near spawn: the hamlet, or the stress-test city. A site shapes the
// ground, writes its buildings into chunks and says what furniture each column has.
// Everything is a pure function of the seed and position, so chunks can generate in
// any order.

import { rectDistance as cellDistance } from './authoredTerrain.mjs';
import type { EntitySpec } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { SpawnTimeWindowField } from './clock.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { furnitureSurfacePosition } from './furnitureSurface.ts';
import {
  type LootPointSource,
  type LootSpawnPoint,
  lootPointStream,
  lootPointsByColumn,
  type Rolled,
  rollLootParts,
} from './loot.ts';
import type { FixedLootItemDef, FixedLootOverrideDef } from './schema.ts';
import { type Placement, placedGroundLoot, placedPieces } from './templates.ts';
import type { Surface } from './worldgen.ts';

/** A rectangle of block columns. */
export interface Rect {
  x0: number;
  z0: number;
  /** Exclusive. */
  x1: number;
  z1: number;
}

/** Blocks from a column to a rectangle; 0 inside. */
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
export const rectDistance = (r: Rect, x: number, z: number): number => cellDistance(r, x + 0.5, z + 0.5, 1);

export const grow = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, z0: r.z0 - by, x1: r.x1 + by, z1: r.z1 + by });

/** A piece of furniture and what worldgen put in it. */
export interface FurnitureSpawn {
  spec: EntitySpec;
  loot: Rolled[];
  /** How many leading `loot` items are required fixed stock, which must fit. */
  fixedCount?: number;
  /** Fixed items laid out as a visible pile on the furniture's top surface. */
  surfaceLoot?: Rolled[];
}

export type ZombieSpawn = {
  type: string;
  /** Feet position in world blocks. */
  pos: Vec3;
} & SpawnTimeWindowField;

export interface HordeSpawn {
  id: string;
  type: string;
  /** Feet position in world blocks. */
  pos: Vec3;
  members: number;
}

/** Observation only: what the playtest metrics watch for. Nothing in the simulation reads it. */
export interface PlaytestMarks {
  /** Beat areas, in blocks. */
  readonly beats: readonly { readonly id: string; readonly area: Rect }[];
  /** Key fixed-loot item ids, keyed by their furniture's anchor block ("x,y,z"). */
  readonly keyLoot: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface Site {
  /** Finished authored footprints eligible for world-derived sky transport. */
  readonly authoredPlacements?: readonly Placement[];
  /** An authored site's playtest beats and key fixed loot. */
  readonly playtestMarks?: PlaytestMarks;
  /** The ground under the site, blended into the natural ground around it. */
  readonly surface: Surface;
  /** Where the player starts: feet in metres, and a yaw. */
  readonly spawn: { pos: Vec3; yaw: number };
  /** Writes the site's blocks that fall inside a chunk. */
  stamp: (chunk: Chunk) => void;
  /** Descriptions include empty containers and do not roll or materialize supply. */
  lootPointsIn: (cx: number, cz: number) => readonly LootSpawnPoint[];
  /** Furniture anchored in the column (cx, cz), with its loot. */
  furnitureIn: (cx: number, cz: number) => FurnitureSpawn[];
  /** Zombie spawns anchored in the column, deterministic for the site seed. */
  zombiesIn: (cx: number, cz: number) => ZombieSpawn[];
  /** Optional group spawns anchored in a single column, deterministic for the site seed. */
  hordesIn?: ((cx: number, cz: number) => HordeSpawn[]) | undefined;
}

export type ColumnSource = Pick<Site, 'furnitureIn' | 'lootPointsIn' | 'zombiesIn' | 'hordesIn'>;

const pointSupply = (table: string | undefined, items: readonly FixedLootItemDef[]): LootPointSource['supply'] => {
  if (items.length > 0) {
    return { kind: 'fixed', items, ...(table === undefined ? {} : { table }) };
  }
  return table === undefined ? { kind: 'empty' } : { kind: 'table', table };
};

export const lootSourcesOf = (
  registry: Registry,
  site: string,
  placement: Placement,
  fixedLoot: readonly FixedLootOverrideDef[] = [],
): LootPointSource[] => {
  const context = placement.lootContext ?? placement.template.lootContext;
  const building = JSON.stringify([placement.origin, placement.turn]);
  const placed = placedPieces(placement);
  const furniture = placement.template.pieces.flatMap((piece, i) => {
    const world = placed[i]!;
    const override = fixedLoot.find((entry) => entry.at.join(',') === piece.pos.join(','));
    const items = [...(piece.items ?? []), ...(override?.items ?? [])];
    const container = items.filter((item) => item.placement !== 'surface');
    const surface = items.filter((item) => item.placement === 'surface');
    const usage = override?.lootUsage ?? piece.lootUsage;
    const base = {
      site,
      building,
      anchor: piece.pos,
      destination: world.pos,
      context,
      ...(usage === undefined ? {} : { usage }),
    };
    const sources: LootPointSource[] = [];
    if (registry.furniture.get(piece.furniture)?.container) {
      sources.push({
        ...base,
        channel: 'container',
        position: world.pos,
        supply: pointSupply(piece.loot, container),
        required: container.length > 0,
      });
    }
    if (surface.length > 0) {
      sources.push({
        ...base,
        channel: 'surface',
        position: furnitureSurfacePosition(world),
        supply: { kind: 'fixed', items: surface },
        required: true,
      });
    }
    return sources;
  });
  const ground = placedGroundLoot(placement).map(
    (point, i): LootPointSource => ({
      site,
      building,
      anchor: placement.template.groundLoot![i]!.pos,
      channel: 'ground',
      position: point.pos,
      destination: point.pos,
      context,
      ...(point.lootUsage === undefined ? {} : { usage: point.lootUsage }),
      supply: point.supply,
      required: point.supply.kind === 'fixed',
    }),
  );
  return [...furniture, ...ground];
};

export const lootPointsOf = (
  registry: Registry,
  site: string,
  placement: Placement,
  [cx, cz]: readonly [number, number],
): readonly LootSpawnPoint[] => lootPointsByColumn(lootSourcesOf(registry, site, placement)).get(`${cx},${cz}`) ?? [];

/**
 * The furniture of a placed template that's anchored in a column, with loot rolled
 * for each container from a stream of its own, keyed by where it is.
 */
export const furnitureOf = (
  { seed, registry }: { seed: number; registry: Registry },
  placement: Placement,
  [cx, cz]: readonly [number, number],
  points: readonly LootSpawnPoint[],
): FurnitureSpawn[] =>
  fillFurnitureLoot(
    registry,
    seed,
    placedPieces(placement)
      .filter((piece) => toChunk(piece.pos[0]) === cx && toChunk(piece.pos[2]) === cz)
      .map((piece) => ({
        spec: {
          type: piece.furniture,
          pos: piece.pos,
          size: piece.size,
          facing: piece.facing,
          ...(piece.tip ? { tip: piece.tip } : {}),
          ...(piece.lock ? { lock: piece.lock } : {}),
          ...(piece.fixed ? { fixed: true as const } : {}),
        },
        loot: [],
      })),
    points,
  );

export const fillFurnitureLoot = (
  registry: Registry,
  seed: number,
  spawns: readonly FurnitureSpawn[],
  points: readonly LootSpawnPoint[],
): FurnitureSpawn[] =>
  spawns.map((spawn) => {
    const at = points.filter((point) => point.destination.every((value, axis) => value === spawn.spec.pos[axis]));
    const items = (channel: LootSpawnPoint['channel']) =>
      at
        .filter((point) => point.channel === channel)
        .map((point) => rollLootParts(registry, point, lootPointStream(seed, point)));
    const container = items('container');
    const fixed = container.flatMap((part) => part.fixed);
    return {
      ...spawn,
      loot: [...fixed, ...container.flatMap((part) => part.rolled)],
      ...(fixed.length > 0 ? { fixedCount: fixed.length } : {}),
      surfaceLoot: items('surface').flatMap((part) => [...part.fixed, ...part.rolled]),
    };
  });
