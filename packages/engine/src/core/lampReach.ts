// Where a point light reaches, computed with the rules' own wall check (`illumination.ts`, `reaches`) so the
// picture cannot disagree with the rules (`packages/deadvox/DESIGN.md`, "Light"). The renderer uploads these grids; a
// lamp's light is dropped wherever its grid says blocked.

import type { BlockEntities } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { CHUNK } from './coords.ts';
import { reaches } from './illumination.ts';
import type { SolidAt } from './raycast.ts';
import type { PoweredLight } from './sitePower.ts';
import type { World } from './world.ts';

/** Content's grid tunables (`senses`, `light.illumination.reach`). */
export interface LampReachTuning {
  /** Blocks per grid cell along each axis; edges are one cell wide. */
  cellBlocks: number;
  /** The most of a lamp's radius that gets a grid, in metres. */
  rangeMetres: number;
}

/** A cube of cells centred on a lamp; each holds 1 where the lamp reaches and 0 where a wall stops it. */
export interface LampReach {
  /** Lowest cell of the grid, in cells (a cell is `cellBlocks` blocks). */
  readonly origin: Vec3;
  /** Cells per axis. */
  readonly size: number;
  readonly cellBlocks: number;
  /** Cell `x + size * (z + size * y)`. */
  readonly cells: Uint8Array;
  /** Goes up at every rebuild, so an uploader can tell a new grid from the one it holds. */
  readonly revision: number;
  /** 0 or 1 at a point in blocks; 1 outside the grid, where the lamp is out of range anyway. */
  readonly at: (point: Readonly<Vec3>) => number;
}

interface Entry {
  light: PoweredLight;
  /** The block cube the grid covers, for deciding whether an edit touches it. */
  min: Vec3;
  max: Vec3;
  reach: LampReach | undefined;
  stale: boolean;
  revision: number;
}

const keyOf = ({ pos, radius }: PoweredLight): string => `${pos.join(',')}:${radius}`;

const boxesOverlap = (aMin: Readonly<Vec3>, aMax: Readonly<Vec3>, bMin: Readonly<Vec3>, bMax: Readonly<Vec3>) =>
  [0, 1, 2].every((axis) => aMin[axis]! < bMax[axis]! && bMin[axis]! < aMax[axis]!);

/**
 * Shared reach for point lights (`packages/deadvox/DESIGN.md`, "Light"). Moving renderer slots keep a bounded
 * identity instead of caching every frame's position; subcell motion reuses reach to keep held lights cheap.
 */
export class LampReachCache {
  private readonly entries = new Map<string | object, Entry>();
  private readonly isBlocking: SolidAt;
  private readonly tuning: LampReachTuning;
  private readonly blockSize: number;
  private readonly entities: BlockEntities;
  private readonly world: World;
  private readonly blockingChunks = new Map<string, Uint8Array>();
  private readonly dirtyBlockingChunks = new Set<string>();
  private blockingVolume:
    | { version: number; standing: number; origin: Vec3; size: Vec3; cells: Uint8Array }
    | undefined;
  private standing: number;
  private readonly unwatch: () => void;

  constructor(
    owner: { world: World; entities: BlockEntities },
    isBlocking: SolidAt,
    blockSize: number,
    tuning: LampReachTuning,
  ) {
    this.isBlocking = isBlocking;
    this.blockSize = blockSize;
    this.tuning = tuning;
    this.entities = owner.entities;
    this.world = owner.world;
    this.standing = owner.entities.standing;
    this.unwatch = owner.world.watchChunks((cx, cy, cz) => {
      if (this.blockingVolume) {
        this.dirtyBlockingChunks.add(`${cx},${cy},${cz}`);
      }
      this.markStale([cx * CHUNK, cy * CHUNK, cz * CHUNK], [(cx + 1) * CHUNK, (cy + 1) * CHUNK, (cz + 1) * CHUNK]);
    });
  }

  /** Prototype GPU input: the same blocking predicate as the rules, rebuilt only when its owners change. */
  blockers(): { origin: Vec3; size: Vec3; cells: Uint8Array } {
    if (
      this.blockingVolume?.version === this.world.version &&
      this.blockingVolume.standing === this.entities.standing
    ) {
      return this.blockingVolume;
    }
    const pieces = this.entities.standingChangesSince(this.blockingVolume?.standing ?? -1);
    const { origin, size } = this.blockerBounds();
    const cells = new Uint8Array(size[0] * size[1] * size[2]);
    for (const key of this.blockingChunks.keys()) {
      if (!this.world.chunks.has(key)) {
        this.blockingChunks.delete(key);
      }
    }
    for (const [key, { cx, cy, cz }] of this.world.chunks) {
      const min: Vec3 = [cx * CHUNK, cy * CHUNK, cz * CHUNK];
      const max: Vec3 = min.map((v) => v + CHUNK) as Vec3;
      const pieceChanged =
        pieces === undefined ||
        pieces.some(({ pos, size: s }) => boxesOverlap(min, max, pos, pos.map((v, axis) => v + s[axis]!) as Vec3));
      let chunk = this.blockingChunks.get(key);
      if (!chunk || pieceChanged || this.dirtyBlockingChunks.has(key)) {
        chunk = this.sampleBlockingChunk(min);
        this.blockingChunks.set(key, chunk);
      }
      this.packBlockingChunk(chunk, min, { cells, origin, size });
    }
    this.dirtyBlockingChunks.clear();
    this.blockingVolume = { version: this.world.version, standing: this.entities.standing, origin, size, cells };
    return this.blockingVolume;
  }

  private sampleBlockingChunk(min: Vec3): Uint8Array {
    const cells = new Uint8Array(CHUNK ** 3);
    for (let z = 0; z < CHUNK; z++) {
      for (let y = 0; y < CHUNK; y++) {
        for (let x = 0; x < CHUNK; x++) {
          cells[x + CHUNK * (y + CHUNK * z)] = this.isBlocking(x + min[0], y + min[1], z + min[2]) ? 255 : 0;
        }
      }
    }
    return cells;
  }

  private packBlockingChunk(
    chunk: Uint8Array,
    min: Vec3,
    { cells, origin, size }: { cells: Uint8Array; origin: Vec3; size: Vec3 },
  ): void {
    for (let z = 0; z < CHUNK; z++) {
      for (let y = 0; y < CHUNK; y++) {
        const source = CHUNK * (y + CHUNK * z);
        const target = min[0] - origin[0] + size[0] * (min[1] - origin[1] + y + size[1] * (min[2] - origin[2] + z));
        cells.set(chunk.subarray(source, source + CHUNK), target);
      }
    }
  }

  private blockerBounds(): { origin: Vec3; size: Vec3 } {
    const origin: Vec3 = [0, 0, 0];
    const end: Vec3 = [1, 1, 1];
    let first = true;
    for (const { cx, cy, cz } of this.world.chunks.values()) {
      const chunk = [cx, cy, cz];
      for (let axis = 0; axis < 3; axis++) {
        const low = chunk[axis]! * CHUNK;
        origin[axis] = first ? low : Math.min(origin[axis]!, low);
        end[axis] = first ? low + CHUNK : Math.max(end[axis]!, low + CHUNK);
      }
      first = false;
    }
    return { origin, size: end.map((value, axis) => value - origin[axis]!) as Vec3 };
  }

  /** Stops watching the world. */
  dispose(): void {
    this.unwatch();
  }

  private markStale(min: Readonly<Vec3>, max: Readonly<Vec3>): void {
    for (const entry of this.entries.values()) {
      if (boxesOverlap(entry.min, entry.max, min, max)) {
        entry.stale = true;
      }
    }
  }

  private catchUpWithPieces(): void {
    const changed = this.entities.standingChangesSince(this.standing);
    this.standing = this.entities.standing;
    if (changed === undefined) {
      for (const entry of this.entries.values()) {
        entry.stale = true;
      }
      return;
    }
    for (const { pos, size } of changed) {
      this.markStale(pos, [pos[0] + size[0], pos[1] + size[1], pos[2] + size[2]]);
    }
  }

  /** Whether a lamp's grid is built and no change since has touched it. */
  isCurrent(light: PoweredLight): boolean {
    this.catchUpWithPieces();
    const entry = this.entries.get(light.reachSource ?? keyOf(light));
    return entry?.reach !== undefined && !entry.stale && this.sameCell(entry.light, light);
  }

  /**
   * A lamp's grid, rebuilt first if a change touched it. With `mayBuild` false it returns the last grid, or
   * undefined for a lamp not built yet, so a caller can spread rebuilds over frames.
   */
  reachOf(light: PoweredLight, mayBuild = true): LampReach | undefined {
    this.catchUpWithPieces();
    const key = light.reachSource ?? keyOf(light);
    let entry = this.entries.get(key);
    const revision = entry?.revision ?? 0;
    if (entry && !this.sameCell(entry.light, light)) {
      if (!mayBuild) {
        return entry.reach;
      }
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const cells = Math.ceil(
        Math.min(light.radius, this.tuning.rangeMetres) / this.blockSize / this.tuning.cellBlocks,
      );
      const reachBlocks = (cells + 1) * this.tuning.cellBlocks;
      entry = {
        light: { ...light, pos: [...light.pos] },
        min: light.pos.map((value) => Math.floor(value) - reachBlocks) as Vec3,
        max: light.pos.map((value) => Math.floor(value) + reachBlocks + 1) as Vec3,
        reach: undefined,
        stale: true,
        revision,
      };
      this.entries.set(key, entry);
    }
    if (entry.stale && mayBuild) {
      entry.revision += 1;
      entry.reach = this.build(entry);
      entry.stale = false;
    }
    return entry.reach;
  }

  private sameCell(previous: PoweredLight, light: PoweredLight): boolean {
    return (
      previous.radius === light.radius &&
      previous.pos.every(
        (value, axis) =>
          Math.floor(value / this.tuning.cellBlocks) === Math.floor(light.pos[axis]! / this.tuning.cellBlocks),
      )
    );
  }

  private build({ light, revision }: Entry): LampReach {
    const { cellBlocks, rangeMetres } = this.tuning;
    const range = Math.min(light.radius, rangeMetres) / this.blockSize;
    const half = Math.ceil(range / cellBlocks);
    const size = 2 * half + 1;
    const origin = light.pos.map((value) => Math.floor(value / cellBlocks) - half) as Vec3;
    const cells = new Uint8Array(size ** 3).fill(1);
    // Rays share blocking queries, not visibility: a clear receiver does not prove its neighbours clear.
    // Pad the bounds for a ray ending exactly on a voxel boundary in the negative direction.
    const min = light.pos.map((value) => Math.floor(value - range) - 1) as Vec3;
    const extent = Math.ceil(2 * range) + 3;
    const blocking = new Uint8Array(extent ** 3);
    const isBlocking: SolidAt = (x, y, z) => {
      const index = x - min[0] + extent * (z - min[2] + extent * (y - min[1]));
      let value = blocking[index]!;
      if (value === 0) {
        value = this.isBlocking(x, y, z) ? 2 : 1;
        blocking[index] = value;
      }
      return value === 2;
    };
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const centre: Vec3 = [
            (origin[0] + x + 0.5) * cellBlocks,
            (origin[1] + y + 0.5) * cellBlocks,
            (origin[2] + z + 0.5) * cellBlocks,
          ];
          const distance = Math.hypot(centre[0] - light.pos[0], centre[1] - light.pos[1], centre[2] - light.pos[2]);
          // Past the range no light is drawn, so the cell is never read; it keeps the default.
          if (distance <= range && !reaches(light.pos, centre, isBlocking, light.body)) {
            cells[x + size * (z + size * y)] = 0;
          }
        }
      }
    }
    return {
      origin,
      size,
      cellBlocks,
      cells,
      revision,
      at: (point) => {
        const cell = point.map((value, axis) => Math.floor(value / cellBlocks) - origin[axis]!);
        return cell.some((value) => value < 0 || value >= size)
          ? 1
          : cells[cell[0]! + size * (cell[2]! + size * cell[1]!)]!;
      },
    };
  }
}
