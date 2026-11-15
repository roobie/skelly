import type { BlockEntities } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { CHUNK } from './coords.ts';
import { reaches } from './lightGridRay.ts';
import type { SolidAt } from './raycast.ts';
import type { PoweredLight } from './sitePower.ts';
import type { World } from './world.ts';

/** Content's receiver-cell width (`senses`, `light.illumination.reach`). */
export interface LampReachTuning {
  cellBlocks: number;
}

type Source = Pick<PoweredLight, 'pos' | 'radius' | 'reachSource'> & { body?: PoweredLight['body'] };
interface Bounds {
  readonly min: Readonly<Vec3>;
  readonly max: Readonly<Vec3>;
}
interface Occluders {
  readonly version: number;
  boxes: () => readonly Bounds[];
}

/** The stored wall answer shared by gameplay and the picture. */
export interface LampReach {
  readonly origin: Vec3;
  readonly size: number;
  readonly cellBlocks: number;
  /** Cell `x + size * (z + size * y)`. */
  readonly cells: Uint8Array;
  readonly revision: number;
  readonly at: (point: Readonly<Vec3>) => number;
}

interface Entry {
  light: Source;
  min: Vec3;
  max: Vec3;
  reach: LampReach | undefined;
  stale: boolean;
  revision: number;
}

const keyOf = ({ pos, radius }: Source): string => `${pos.join(',')}:${radius}`;
const boxesOverlap = (aMin: Readonly<Vec3>, aMax: Readonly<Vec3>, bMin: Readonly<Vec3>, bMax: Readonly<Vec3>) =>
  [0, 1, 2].every((axis) => aMin[axis]! < bMax[axis]! && bMin[axis]! < aMax[axis]!);

/** One owner of quantized point-light reach, derived from live world state and never saved. */
export class LampReachCache {
  private readonly entries = new Map<string | object, Entry>();
  private readonly isBlocking: SolidAt;
  private readonly tuning: LampReachTuning;
  private readonly blockSize: number;
  private readonly entities: BlockEntities;
  private readonly occluders: Occluders | undefined;
  private occluderVersion: number;
  private occluderBoxes: readonly Bounds[];
  private standing: number;
  private readonly unwatch: () => void;

  constructor(
    owner: { world: World; entities: BlockEntities; occluders?: Occluders },
    isBlocking: SolidAt,
    blockSize: number,
    tuning: LampReachTuning,
  ) {
    this.isBlocking = isBlocking;
    this.blockSize = blockSize;
    this.tuning = tuning;
    this.entities = owner.entities;
    this.occluders = owner.occluders;
    this.occluderVersion = owner.occluders?.version ?? 0;
    this.occluderBoxes = owner.occluders?.boxes() ?? [];
    this.standing = owner.entities.standing;
    this.unwatch = owner.world.watchChunks((cx, cy, cz) => {
      this.markStale([cx * CHUNK, cy * CHUNK, cz * CHUNK], [(cx + 1) * CHUNK, (cy + 1) * CHUNK, (cz + 1) * CHUNK]);
    });
  }

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
    if (this.occluders && this.occluderVersion !== this.occluders.version) {
      const boxes = this.occluders.boxes();
      for (const { min, max } of [...this.occluderBoxes, ...boxes]) {
        this.markStale(min, max);
      }
      this.occluderBoxes = boxes;
      this.occluderVersion = this.occluders.version;
    }
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

  isCurrent(light: Source): boolean {
    this.catchUpWithPieces();
    const entry = this.entries.get(light.reachSource ?? keyOf(light));
    return entry?.reach !== undefined && !entry.stale && this.sameCell(entry.light, light);
  }

  /** With `mayBuild` false, scheduling may retain the owner's last stored grid, never invent a second answer. */
  reachOf(light: Source, mayBuild = true): LampReach | undefined {
    this.catchUpWithPieces();
    const key = light.reachSource ?? keyOf(light);
    let entry = this.entries.get(key);
    const revision = entry?.revision ?? 0;
    if (entry && !this.sameCell(entry.light, light)) {
      const shared = [...this.entries.values()].find(
        (candidate) => !candidate.stale && candidate.reach && this.sameCell(candidate.light, light),
      );
      if (shared) {
        this.entries.set(key, shared);
        return shared.reach;
      }
      if (!mayBuild) {
        return entry.reach;
      }
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      entry = [...this.entries.values()].find((candidate) => this.sameCell(candidate.light, light));
      if (entry) {
        this.entries.set(key, entry);
      }
    }
    if (!entry) {
      const { cellBlocks } = this.tuning;
      // Quantize the source too: the answer cannot depend on which subcell pose first asked or survived a reload.
      const pos = light.pos.map((value) => (Math.floor(value / cellBlocks) + 0.5) * cellBlocks) as Vec3;
      const half = Math.ceil(light.radius / this.blockSize / cellBlocks);
      const min = pos.map((value) => (Math.floor(value / cellBlocks) - half) * cellBlocks) as Vec3;
      entry = {
        light: { ...light, pos },
        min,
        max: min.map((value) => value + (2 * half + 1) * cellBlocks) as Vec3,
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

  private sameCell(previous: Source, light: Source): boolean {
    const sameBody =
      previous.body === light.body ||
      (previous.body !== undefined &&
        light.body !== undefined &&
        previous.body.min.every((v, i) => v === light.body!.min[i]) &&
        previous.body.max.every((v, i) => v === light.body!.max[i]));
    return (
      Boolean(sameBody) &&
      previous.radius === light.radius &&
      previous.pos.every(
        (value, axis) =>
          Math.floor(value / this.tuning.cellBlocks) === Math.floor(light.pos[axis]! / this.tuning.cellBlocks),
      )
    );
  }

  private build({ light, revision }: Entry): LampReach {
    const { cellBlocks } = this.tuning;
    const range = light.radius / this.blockSize;
    const half = Math.ceil(range / cellBlocks);
    const size = 2 * half + 1;
    const origin = light.pos.map((value) => Math.floor(value / cellBlocks) - half) as Vec3;
    const cells = new Uint8Array(size ** 3).fill(1);
    const min = origin.map((value) => Math.floor(value * cellBlocks) - 1) as Vec3;
    const extent = Math.ceil(size * cellBlocks) + 3;
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
    // Source and receiver cells can straddle the physical radius; their centres must still get a wall answer.
    const reachSquared = (range + Math.sqrt(3) * cellBlocks) ** 2;
    const centre: Vec3 = [0, 0, 0];
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          centre[0] = (origin[0] + x + 0.5) * cellBlocks;
          centre[1] = (origin[1] + y + 0.5) * cellBlocks;
          centre[2] = (origin[2] + z + 0.5) * cellBlocks;
          const dx = centre[0] - light.pos[0];
          const dy = centre[1] - light.pos[1];
          const dz = centre[2] - light.pos[2];
          const distanceSquared = dx * dx + dy * dy + dz * dz;
          if (distanceSquared <= reachSquared && !reaches(light.pos, centre, isBlocking, light.body)) {
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
