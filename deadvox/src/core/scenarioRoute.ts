import { BlockEntities, type BlockEntity } from './blockEntities.ts';
import type { CitySite } from './citySite.ts';
import { worldOpaque, worldSolid } from './collision.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import { raycast } from './raycast.ts';
import { pileDistance, reachTuning } from './reach.ts';
import { makeScale } from './scale.ts';
import { sitePalette, terrainShapeOf } from './sitePalette.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import { footprint, type Placement } from './templates.ts';
import { World } from './world.ts';
import { generateChunk } from './worldgen.ts';

const key = (point: readonly number[]) => point.join(',');

const nearest = (queue: Vec3[], to: Readonly<Vec3>): Vec3 => {
  const distance = (point: Vec3) =>
    Math.abs(point[0] - to[0]) + Math.abs(point[1] - to[1]) + Math.abs(point[2] - to[2]);
  let closest = 0;
  for (let i = 1; i < queue.length; i++) {
    if (distance(queue[i]!) < distance(queue[closest]!)) {
      closest = i;
    }
  }
  return queue.splice(closest, 1)[0]!;
};

const reconstruct = (parents: Map<string, Vec3 | undefined>, point: Vec3, to: Readonly<Vec3>): Vec3[] => {
  const route: Vec3[] = [[...to], point];
  let previous = parents.get(key(point));
  while (previous) {
    route.push(previous);
    previous = parents.get(key(previous));
  }
  return route.reverse();
};

export class ScenarioRouteSpace {
  readonly world = new World();
  readonly entities: BlockEntities;
  readonly site: CitySite;
  private readonly chunks = new Set<string>();
  private readonly columns = new Set<string>();
  private readonly admittedLocks = new Set<string>();
  private readonly standingCache = new Map<string, boolean>();
  private readonly clearCache = new Map<string, boolean>();
  private readonly furnitureReach: number;
  private readonly terrain;
  private readonly solid;
  private readonly opaque;

  constructor(site: CitySite) {
    this.site = site;
    this.entities = new BlockEntities(site.registry);
    this.furnitureReach = Math.ceil(
      Math.max(
        ...site.placements.flatMap((placement) =>
          placement.template.pieces.flatMap((piece) => [piece.size[0] - 1, piece.size[2] - 1]),
        ),
        0,
      ) / CHUNK,
    );
    this.terrain = {
      seed: site.seed,
      scale: makeScale(HAMLET_BLOCK_SIZE),
      blocks: sitePalette(site.registry).terrain,
      shape: terrainShapeOf(site.registry),
      surface: site.surface,
    };
    this.solid = worldSolid(this.world, site.registry, this.entities);
    this.opaque = worldOpaque(this.world, site.registry, this.entities);
  }

  private load(x: number, y: number, z: number): void {
    const cell: Vec3 = [toChunk(x), toChunk(y), toChunk(z)];
    const chunkKey = key(cell);
    if (!this.chunks.has(chunkKey)) {
      this.chunks.add(chunkKey);
      const chunk = generateChunk(this.terrain, cell);
      this.site.stamp(chunk);
      this.world.addChunk(chunk);
      // The initial world is fixed: load boundary-crossing furniture once per chunk, not per voxel query.
      for (let dx = 0; dx <= this.furnitureReach; dx++) {
        for (let dz = 0; dz <= this.furnitureReach; dz++) {
          this.loadFurniture(cell[0] - dx, cell[2] - dz);
        }
      }
    }
  }

  private loadFurniture(cx: number, cz: number): void {
    const column = key([cx, cz]);
    if (this.columns.has(column)) {
      return;
    }
    this.columns.add(column);
    for (const spawn of this.site.furnitureIn(cx, cz)) {
      const entity = this.entities.add(spawn.spec)!;
      // Only reversible, initially unlocked doors belong to the construction route.
      if (this.entities.defOf(entity).door && (!entity.lock?.locked || this.admittedLocks.has(entity.lock.id))) {
        entity.open = true;
      }
    }
  }

  admitLock(id: string): void {
    this.admittedLocks.add(id);
    for (const entity of this.entities.all) {
      if (entity.lock?.id === id) {
        entity.open = true;
      }
    }
    this.standingCache.clear();
    this.clearCache.clear();
  }

  blocked(x: number, y: number, z: number): boolean {
    this.load(x, y, z);
    return this.solid(x, y, z);
  }

  clear(point: Readonly<Vec3>): boolean {
    const cached = this.clearCache.get(key(point));
    if (cached !== undefined) {
      return cached;
    }
    const result = this.bodyClear(point);
    this.clearCache.set(key(point), result);
    return result;
  }

  private bodyClear([x, feet, z]: Readonly<Vec3>): boolean {
    for (let y = Math.floor(feet); y < Math.ceil(feet + STAIR_BODY_HEIGHT); y++) {
      for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz++) {
        for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx++) {
          if (this.blocked(bx, y, bz)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  standing(point: Readonly<Vec3>): boolean {
    const cached = this.standingCache.get(key(point));
    if (cached !== undefined) {
      return cached;
    }
    const result = this.supported(point);
    this.standingCache.set(key(point), result);
    return result;
  }

  private supported(point: Readonly<Vec3>): boolean {
    if (!this.clear(point)) {
      return false;
    }
    const [x, feet, z] = point;
    for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx++) {
        if (this.blocked(bx, Math.floor(feet) - 1, bz)) {
          return true;
        }
      }
    }
    return false;
  }

  sweep(from: Readonly<Vec3>, to: Readonly<Vec3>, supported = true): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(...to.map((value, axis) => value - from[axis]!)) * 4));
    for (let step = 0; step <= steps; step++) {
      const point = from.map((value, axis) => value + ((to[axis]! - value) * step) / steps) as Vec3;
      if (!(supported ? this.standing(point) : this.clear(point))) {
        return false;
      }
    }
    return true;
  }

  path(
    from: Readonly<Vec3>,
    to: Readonly<Vec3>,
    options: { steps?: boolean; placement?: Placement } = {},
  ): Vec3[] | undefined {
    if ((!options.steps && from[1] !== to[1]) || !this.standing(from) || !this.standing(to)) {
      return undefined;
    }
    const service = options.placement ?? this.site.plan.service!;
    const [width, depth] = footprint(service);
    const authoredSurface =
      !options.placement && from[1] === this.site.plan.floor + 1 && (this.site.plan.lots?.length ?? 0) > 0;
    const bounds = authoredSurface
      ? this.site.bounds
      : {
          x0: Math.min(from[0], to[0], service.origin[0] - 2),
          x1: Math.max(from[0], to[0], service.origin[0] + width + 2),
          z0: Math.min(from[2], to[2], service.origin[2] - 2),
          z1: Math.max(from[2], to[2], service.origin[2] + depth + 2),
        };
    const within = ([x, y, z]: Vec3) =>
      x >= bounds.x0 &&
      x <= bounds.x1 &&
      z >= bounds.z0 &&
      z <= bounds.z1 &&
      (!options.steps || (y >= Math.min(from[1], to[1]) && y <= Math.max(from[1], to[1])));
    return this.search(from, to, within, options.steps ?? false);
  }

  private *neighbours(point: Vec3, steps: boolean): Generator<Vec3> {
    for (const [dx, dz] of [
      [0.5, 0],
      [-0.5, 0],
      [0, 0.5],
      [0, -0.5],
    ]) {
      for (const dy of steps ? [0, 1, -1] : [0]) {
        yield [point[0] + dx!, point[1] + dy, point[2] + dz!];
      }
    }
  }

  private search(
    from: Readonly<Vec3>,
    to: Readonly<Vec3>,
    within: (point: Vec3) => boolean,
    steps: boolean,
  ): Vec3[] | undefined {
    const queue: Vec3[] = [[...from]];
    const parents = new Map<string, Vec3 | undefined>([[key(from), undefined]]);
    while (queue.length > 0) {
      const point = nearest(queue, to);
      if (point[1] === to[1] && Math.hypot(point[0] - to[0], point[2] - to[2]) <= 0.5 && this.sweep(point, to)) {
        return reconstruct(parents, point, to);
      }
      for (const next of this.neighbours(point, steps)) {
        if (
          within(next) &&
          !parents.has(key(next)) &&
          (point[1] === next[1] ? this.sweep(point, next) : this.step(point, next))
        ) {
          parents.set(key(next), point);
          queue.push(next);
        }
      }
    }
    return undefined;
  }

  private step(from: Readonly<Vec3>, to: Readonly<Vec3>): boolean {
    const height = Math.max(from[1], to[1]);
    const raisedFrom: Vec3 = [from[0], height, from[2]];
    const raisedTo: Vec3 = [to[0], height, to[2]];
    return (
      this.standing(to) &&
      this.sweep(from, raisedFrom, false) &&
      this.sweep(raisedFrom, raisedTo, false) &&
      this.sweep(raisedTo, to, false)
    );
  }

  visibleReach(point: Readonly<Vec3>, entity: BlockEntity): boolean {
    const { chestHeightMetres, reachMetres } = reachTuning(this.site.registry);
    const chest: Vec3 = [point[0], point[1] + chestHeightMetres / HAMLET_BLOCK_SIZE, point[2]];
    const target = chest.map((value, axis) =>
      Math.max(entity.pos[axis]!, Math.min(value, entity.pos[axis]! + entity.size[axis]!)),
    ) as Vec3;
    return this.visibleTarget(chest, target, reachMetres, entity);
  }

  visibleGroundReach(point: Readonly<Vec3>, target: Readonly<Vec3>): boolean {
    const { chestHeightMetres, reachMetres } = reachTuning(this.site.registry);
    return (
      pileDistance([...point], [...target], HAMLET_BLOCK_SIZE) <= reachMetres &&
      this.visibleTarget(
        [point[0], point[1] + chestHeightMetres / HAMLET_BLOCK_SIZE, point[2]],
        target.map((value) => value + 0.5) as Vec3,
        Number.POSITIVE_INFINITY,
      )
    );
  }

  private visibleTarget(
    chest: Readonly<Vec3>,
    target: Readonly<Vec3>,
    reachMetres: number,
    entity?: BlockEntity,
  ): boolean {
    const offset = target.map((value, axis) => value - chest[axis]!) as Vec3;
    const distance = Math.hypot(...offset);
    if (distance * HAMLET_BLOCK_SIZE > reachMetres) {
      return false;
    }
    if (distance === 0) {
      return true;
    }
    const direction = offset.map((value) => value / distance) as Vec3;
    return (
      raycast([...chest], direction, distance, (x, y, z) => {
        this.load(x, y, z);
        return (entity === undefined || this.entities.at(x, y, z) !== entity) && this.opaque(x, y, z);
      }) === undefined
    );
  }
}
