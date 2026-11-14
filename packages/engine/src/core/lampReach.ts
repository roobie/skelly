// Where a powered lamp's light reaches, computed with the rules' own wall check (`illumination.ts`, `reaches`) so the
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
 * One reach grid per lit lamp, kept current: a changed chunk or standing piece marks stale only the lamps whose grid
 * it overlaps, so putting up a wall beside a lamp rebuilds that lamp and no other.
 */
export class LampReachCache {
  private readonly entries = new Map<string, Entry>();
  private readonly isBlocking: SolidAt;
  private readonly tuning: LampReachTuning;
  private readonly blockSize: number;
  private readonly entities: BlockEntities;
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
    this.standing = owner.entities.standing;
    this.unwatch = owner.world.watchChunks((cx, cy, cz) => {
      this.markStale([cx * CHUNK, cy * CHUNK, cz * CHUNK], [(cx + 1) * CHUNK, (cy + 1) * CHUNK, (cz + 1) * CHUNK]);
    });
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
    const entry = this.entries.get(keyOf(light));
    return entry?.reach !== undefined && !entry.stale;
  }

  /**
   * A lamp's grid, rebuilt first if a change touched it. With `mayBuild` false it returns the last grid, or
   * undefined for a lamp not built yet, so a caller can spread rebuilds over frames.
   */
  reachOf(light: PoweredLight, mayBuild = true): LampReach | undefined {
    this.catchUpWithPieces();
    const key = keyOf(light);
    let entry = this.entries.get(key);
    if (!entry) {
      const cells = Math.ceil(
        Math.min(light.radius, this.tuning.rangeMetres) / this.blockSize / this.tuning.cellBlocks,
      );
      const reachBlocks = (cells + 1) * this.tuning.cellBlocks;
      entry = {
        light,
        min: light.pos.map((value) => Math.floor(value) - reachBlocks) as Vec3,
        max: light.pos.map((value) => Math.floor(value) + reachBlocks + 1) as Vec3,
        reach: undefined,
        stale: true,
        revision: 0,
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

  private build({ light, revision }: Entry): LampReach {
    const { cellBlocks, rangeMetres } = this.tuning;
    const range = Math.min(light.radius, rangeMetres) / this.blockSize;
    const half = Math.ceil(range / cellBlocks);
    const size = 2 * half + 1;
    const origin = light.pos.map((value) => Math.floor(value / cellBlocks) - half) as Vec3;
    const cells = new Uint8Array(size ** 3).fill(1);
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const centre = [x, y, z].map((cell, axis) => (origin[axis]! + cell + 0.5) * cellBlocks) as Vec3;
          const distance = Math.hypot(...centre.map((value, axis) => value - light.pos[axis]!));
          // Past the range no light is drawn, so the cell is never read; it keeps the default.
          if (distance <= range && !reaches(light.pos, centre, this.isBlocking, light.body)) {
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
