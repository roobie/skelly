// Where a point light reaches, computed with the rules' own wall check (`illumination.ts`, `reaches`) so the
// picture cannot disagree with the rules (`packages/deadvox/DESIGN.md`, "Light"). The renderer uploads these grids; a
// lamp's light is dropped wherever its grid says blocked.

import type { BlockEntities } from './blockEntities.ts';
import type { LightBlocking, LightMemo } from './collision.ts';
import type { Vec3 } from './coords.ts';
import { CHUNK } from './coords.ts';
import { reaches } from './illumination.ts';
import type { SolidAt } from './raycast.ts';
import type { PoweredLight } from './sitePower.ts';
import type { ChunkSource } from './terrainRead.ts';

/** Content's grid tunables (`senses`, `light.illumination.reach`). */
export interface LampReachTuning {
  /** Blocks per grid cell along each axis; edges are one cell wide. */
  cellBlocks: number;
  /** Bound fixture uploads without shortening item-light discovery. */
  rangeMetres: number;
  viewBuildWorkPerFrame: number;
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

interface BuiltReach {
  reach: LampReach;
  points: Float64Array;
}

interface Entry {
  light: PoweredLight;
  rangeMetres: number;
  cellBlocks: number;
  surface: boolean;
  viewPosition: Vec3;
  /** The block cube the grid covers, for deciding whether an edit touches it. */
  min: Vec3;
  max: Vec3;
  reach: LampReach | undefined;
  stale: boolean;
  pending: Generator<void, BuiltReach> | undefined;
  revision: number;
  view: { key: string; points: Float64Array; rays: Uint8Array; answer: boolean } | undefined;
}

const keyOf = ({ pos, radius }: PoweredLight): string => `${pos.join(',')}:${radius}`;

const boxesOverlap = (aMin: Readonly<Vec3>, aMax: Readonly<Vec3>, bMin: Readonly<Vec3>, bMax: Readonly<Vec3>) =>
  [0, 1, 2].every((axis) => aMin[axis]! < bMax[axis]! && bMin[axis]! < aMax[axis]!);

/**
 * Shared reach for point lights (`packages/deadvox/DESIGN.md`, "Light"). Moving renderer slots keep a bounded
 * identity instead of caching every frame's position; motion avoids rebuilding the still lamp's surface samples.
 */
export class LampReachCache {
  private readonly entries = new Map<string | object, Entry>();
  private readonly isBlocking: LightBlocking;
  private readonly isSightBlocking: SolidAt;
  private readonly tuning: LampReachTuning;
  private readonly blockSize: number;
  private readonly entities: BlockEntities;
  private standing: number;
  private readonly unwatch: () => void;
  private sightRevision = 0;
  private raysLeft = 0;
  private mayBuildView = false;
  private readonly viewPoint: Vec3 = [0, 0, 0];

  constructor(
    owner: { world: ChunkSource; entities: BlockEntities; isSightBlocking?: SolidAt },
    isBlocking: LightBlocking,
    blockSize: number,
    tuning: LampReachTuning,
  ) {
    this.isBlocking = isBlocking;
    this.isSightBlocking = owner.isSightBlocking ?? isBlocking;
    this.blockSize = blockSize;
    this.tuning = tuning;
    this.entities = owner.entities;
    this.standing = owner.entities.standing;
    this.unwatch = owner.world.watchChunks((cx, cy, cz) => {
      this.sightRevision += 1;
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
        entry.pending = undefined;
      }
    }
  }

  private catchUpWithPieces(): void {
    const changed = this.entities.standingChangesSince(this.standing);
    if (this.standing !== this.entities.standing) {
      this.sightRevision += 1;
    }
    this.standing = this.entities.standing;
    if (changed === undefined) {
      for (const entry of this.entries.values()) {
        entry.stale = true;
        entry.pending = undefined;
      }
      return;
    }
    for (const entity of changed) {
      const { pos, size } = entity;
      const swing = entity.window ? Math.max(size[0], size[2]) : 0;
      this.markStale(
        [pos[0] - swing, pos[1], pos[2] - swing],
        [pos[0] + size[0] + swing, pos[1] + size[1], pos[2] + size[2] + swing],
      );
    }
  }

  /** Whether a lamp's grid is built and no change since has touched it. */
  isCurrent(
    light: PoweredLight,
    rangeMetres = this.tuning.rangeMetres,
    cellBlocks = this.tuning.cellBlocks,
    surface = false,
  ): boolean {
    this.catchUpWithPieces();
    const entry = this.entries.get(light.reachSource ?? keyOf(light));
    return (
      entry?.reach !== undefined &&
      !entry.stale &&
      entry.rangeMetres === rangeMetres &&
      entry.cellBlocks === cellBlocks &&
      entry.surface === surface &&
      this.sameCell(entry.light, light, cellBlocks)
    );
  }

  /**
   * Only completed grids escape the owner; work without admission retains the last complete grid.
   */
  reachOf(
    light: PoweredLight,
    mayBuild = true,
    rangeMetres = this.tuning.rangeMetres,
    options: { cellBlocks?: number; surface?: boolean; workPerSlice?: number } = {},
  ): LampReach | undefined {
    const { cellBlocks = this.tuning.cellBlocks, surface = false, workPerSlice = Number.POSITIVE_INFINITY } = options;
    this.catchUpWithPieces();
    const key = light.reachSource ?? keyOf(light);
    let entry = this.entries.get(key);
    const revision = entry?.revision ?? 0;
    const view = entry?.view;
    if (
      entry &&
      (entry.rangeMetres !== rangeMetres ||
        entry.cellBlocks !== cellBlocks ||
        entry.surface !== surface ||
        !this.sameCell(entry.light, light, cellBlocks))
    ) {
      if (!mayBuild) {
        return entry.reach;
      }
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const cells = Math.ceil(Math.min(light.radius, rangeMetres) / this.blockSize / cellBlocks);
      const reachBlocks = (cells + 1) * cellBlocks;
      entry = {
        light: { ...light, pos: [...light.pos] },
        rangeMetres,
        cellBlocks,
        surface,
        viewPosition: [...light.pos],
        view,
        min: light.pos.map((value) => Math.floor(value) - reachBlocks) as Vec3,
        max: light.pos.map((value) => Math.floor(value) + reachBlocks + 1) as Vec3,
        reach: undefined,
        stale: true,
        pending: undefined,
        revision,
      };
      this.entries.set(key, entry);
    }
    if (entry.stale && mayBuild) {
      this.advanceBuild(entry, light, workPerSlice);
    }
    return entry.reach;
  }

  private advanceBuild(entry: Entry, light: PoweredLight, workPerSlice: number) {
    if (entry.surface && !entry.pending) {
      entry.light = { ...light, pos: [...light.pos] };
    }
    entry.pending ??= this.build({ ...entry, revision: entry.revision + 1 }, entry.cellBlocks, workPerSlice);
    const result = entry.pending.next();
    if (result.done) {
      entry.reach = result.value.reach;
      entry.revision = result.value.reach.revision;
      if (entry.surface) {
        entry.view = this.prepareView(entry, result.value.points);
      }
      entry.stale = false;
      entry.pending = undefined;
    }
  }

  /** One candidate's rebuild must not multiply work for the rest of the pool. */
  beginViewFrame(rayBudget: number): void {
    this.raysLeft = rayBudget;
    this.mayBuildView = true;
  }

  /**
   * Reached receivers in the frustum, through ordinary sight. Pending work keeps the last answer.
   * `inView` borrows one point to avoid per-receiver frame allocations.
   */
  meetsView(light: PoweredLight, camera: Vec3, inView: (point: Vec3) => boolean): boolean {
    const moving = this.movingView(light);
    if (moving !== undefined) {
      return moving;
    }
    const current = this.isCurrent(light, light.radius, 1, true);
    const mayBuild = this.mayBuildView;
    this.mayBuildView &&= current;
    const reach = this.reachOf(light, mayBuild, light.radius, {
      cellBlocks: 1,
      surface: true,
      workPerSlice: this.tuning.viewBuildWorkPerFrame,
    });
    const entry = this.entries.get(light.reachSource ?? keyOf(light))!;
    if (!(reach && this.isCurrent(light, light.radius, 1, true))) {
      return entry.view?.answer ?? false;
    }
    const view = entry.view!;
    const cameraCell = camera.map(Math.floor);
    const key = `${cameraCell}:${this.sightRevision}`;
    if (view.key !== key) {
      view.key = key;
      view.rays.fill(0);
    }
    const { rays, points } = view;
    const point = this.viewPoint;
    let pending = false;
    for (let offset = 0; offset < points.length; offset += 3) {
      const index = offset / 3;
      point[0] = points[offset]!;
      point[1] = points[offset + 1]!;
      point[2] = points[offset + 2]!;
      if (rays[index] === 2 || !inView(point)) {
        continue;
      }
      if (this.seenCell(rays, index, camera, point)) {
        view.answer = true;
        return true;
      }
      pending ||= rays[index] === 0;
    }
    view.answer = pending && view.answer;
    return view.answer;
  }

  // Motion, not inventory exposure, avoids rebuilding a fine surface grid each animation frame.
  private movingView(light: PoweredLight): boolean | undefined {
    const entry = this.entries.get(light.reachSource ?? keyOf(light));
    if (!entry) {
      return undefined;
    }
    const moving = entry.viewPosition.some((value, axis) => value !== light.pos[axis]);
    entry.viewPosition[0] = light.pos[0];
    entry.viewPosition[1] = light.pos[1];
    entry.viewPosition[2] = light.pos[2];
    if (!moving) {
      return undefined;
    }
    entry.stale = true;
    entry.pending = undefined;
    const visible = !this.isSightBlocking(Math.floor(light.pos[0]), Math.floor(light.pos[1]), Math.floor(light.pos[2]));
    entry.view ??= { key: '', points: new Float64Array(0), rays: new Uint8Array(0), answer: false };
    entry.view.answer = visible;
    return visible;
  }

  private prepareView(entry: Entry, points: Float64Array): NonNullable<Entry['view']> {
    return {
      key: '',
      points,
      rays: new Uint8Array(points.length / 3),
      answer: entry.view?.answer ?? false,
    };
  }

  private seenCell(rays: Uint8Array, index: number, camera: Vec3, point: Vec3): boolean {
    if (rays[index] === 0 && this.raysLeft > 0) {
      this.raysLeft -= 1;
      // A solid cell's two faces need not share visibility: use free receivers, not a wall's centre.
      rays[index] =
        !this.isSightBlocking(Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2])) &&
        reaches(camera, point, this.isSightBlocking)
          ? 1
          : 2;
    }
    return rays[index] === 1;
  }

  private sameCell(previous: PoweredLight, light: PoweredLight, cellBlocks: number): boolean {
    return (
      previous.radius === light.radius &&
      previous.pos.every((value, axis) => Math.floor(value / cellBlocks) === Math.floor(light.pos[axis]! / cellBlocks))
    );
  }

  private fillBlocking(memo: LightMemo, surface: boolean): void {
    if (this.isBlocking.fill) {
      this.isBlocking.fill(memo);
    } else if (surface) {
      const { min, size, cells } = memo;
      for (let index = 0; index < cells.length; index++) {
        const x = min[0] + (index % size);
        const y = min[1] + Math.floor(index / (size * size));
        const z = min[2] + (Math.floor(index / size) % size);
        cells[index] = this.isBlocking(x, y, z) ? 2 : 1;
      }
    }
  }

  private surfaceAt(point: Vec3, { min, size, cells }: LightMemo): boolean {
    const x = Math.floor(point[0]) - min[0];
    const y = Math.floor(point[1]) - min[1];
    const z = Math.floor(point[2]) - min[2];
    const index = x + size * (z + size * y);
    return (
      cells[index] === 1 &&
      (cells[index - 1] === 2 ||
        cells[index + 1] === 2 ||
        cells[index - size] === 2 ||
        cells[index + size] === 2 ||
        cells[index - size * size] === 2 ||
        cells[index + size * size] === 2)
    );
  }

  private *build(
    { light, revision, rangeMetres, surface }: Entry,
    resolution: number,
    workPerSlice: number,
  ): Generator<void, BuiltReach> {
    const cellBlocks = resolution;
    const range = Math.min(light.radius, rangeMetres) / this.blockSize;
    const half = Math.ceil(range / cellBlocks);
    const size = 2 * half + 1;
    const origin = light.pos.map((value) => Math.floor(value / cellBlocks) - half) as Vec3;
    const cells = new Uint8Array(size ** 3).fill(surface ? 0 : 1);
    // Rays share blocking queries, not visibility: a clear receiver does not prove its neighbours clear.
    // Pad the bounds for a ray ending exactly on a voxel boundary in the negative direction.
    const min = light.pos.map((value) => Math.floor(value - range) - 1) as Vec3;
    const extent = Math.ceil(2 * range) + 3;
    const blocking = new Uint8Array(extent ** 3);
    const memo = { min, size: extent, cells: blocking };
    this.fillBlocking(memo, surface);
    let work = 0;
    const isBlocking: SolidAt = (x, y, z) => {
      // Count ray steps too: equal receiver counts can hide very different traversal work.
      work += 1;
      const index = x - min[0] + extent * (z - min[2] + extent * (y - min[1]));
      let value = blocking[index]!;
      if (value === 0) {
        value = this.isBlocking(x, y, z) ? 2 : 1;
        blocking[index] = value;
      }
      return value === 2;
    };
    const receiver: Vec3 = [0, 0, 0];
    const points: number[] = [];
    for (let index = 0; index < cells.length; index++) {
      if (work >= workPerSlice) {
        work = 0;
        yield;
      }
      work += 1;
      const centre = receiver;
      centre[0] = (origin[0] + (index % size) + 0.5) * cellBlocks;
      centre[1] = (origin[1] + Math.floor(index / (size * size)) + 0.5) * cellBlocks;
      centre[2] = (origin[2] + (Math.floor(index / size) % size) + 0.5) * cellBlocks;
      const dx = centre[0] - light.pos[0];
      const dy = centre[1] - light.pos[1];
      const dz = centre[2] - light.pos[2];
      // Fixture masks retain their outside-range default; surface grids contain only tested receivers.
      if (dx * dx + dy * dy + dz * dz > range * range) {
        continue;
      }
      if (surface && !this.surfaceAt(centre, memo)) {
        continue;
      }
      cells[index] = Number(reaches(light.pos, centre, isBlocking, light.body));
      if (surface && cells[index]) {
        points.push(...centre);
      }
    }
    return {
      points: Float64Array.from(points),
      reach: {
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
      },
    };
  }
}
