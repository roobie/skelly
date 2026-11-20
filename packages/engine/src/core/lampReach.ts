// Where a point light reaches, computed with the rules' own wall check (`illumination.ts`, `reaches`) so the
// picture cannot disagree with the rules (`packages/deadvox/DESIGN.md`, "Light"). The renderer uploads these grids; a
// lamp's light is dropped wherever its grid says blocked.

import type { BlockEntities } from './blockEntities.ts';
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
  rangeMetres: number;
  cellBlocks: number;
  surface: boolean;
  viewPosition: Vec3;
  /** The block cube the grid covers, for deciding whether an edit touches it. */
  min: Vec3;
  max: Vec3;
  reach: LampReach | undefined;
  stale: boolean;
  revision: number;
  view: { key: string; revision: number; points: Float64Array; rays: Uint8Array; answer: boolean } | undefined;
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
  private readonly isBlocking: SolidAt;
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
    isBlocking: SolidAt,
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
   * A lamp's grid, rebuilt first if a change touched it. With `mayBuild` false it returns the last grid, or
   * undefined for a lamp not built yet, so a caller can spread rebuilds over frames.
   */
  reachOf(
    light: PoweredLight,
    mayBuild = true,
    rangeMetres = this.tuning.rangeMetres,
    options: { cellBlocks?: number; surface?: boolean } = {},
  ): LampReach | undefined {
    const { cellBlocks = this.tuning.cellBlocks, surface = false } = options;
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
        revision,
      };
      this.entries.set(key, entry);
    }
    if (entry.stale && mayBuild) {
      if (surface) {
        entry.light = { ...light, pos: [...light.pos] };
      }
      entry.revision += 1;
      entry.reach = this.build(entry, cellBlocks);
      entry.stale = false;
    }
    return entry.reach;
  }

  /** Shares one rebuild and content's sight-ray budget across all item candidates in a frame. */
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
    const reach = this.reachOf(light, this.mayBuildView, light.radius, { cellBlocks: 1, surface: true });
    const entry = this.entries.get(light.reachSource ?? keyOf(light))!;
    this.mayBuildView &&= current || !reach;
    if (!(reach && this.isCurrent(light, light.radius, 1, true))) {
      return entry.view?.answer ?? false;
    }
    if (entry.view?.revision !== reach.revision) {
      entry.view = this.prepareView(entry, reach);
    }
    const { view } = entry;
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
    const visible = !this.isSightBlocking(Math.floor(light.pos[0]), Math.floor(light.pos[1]), Math.floor(light.pos[2]));
    entry.view ??= { key: '', revision: 0, points: new Float64Array(0), rays: new Uint8Array(0), answer: false };
    entry.view.answer = visible;
    return visible;
  }

  private prepareView(entry: Entry, reach: LampReach): NonNullable<Entry['view']> {
    const { size, origin, cellBlocks, cells } = reach;
    const points = new Float64Array(cells.reduce((sum, value) => sum + value, 0) * 3);
    let count = 0;
    for (let index = 0; index < cells.length; index++) {
      if (!cells[index]) {
        continue;
      }
      const x = (origin[0] + (index % size) + 0.5) * cellBlocks;
      const y = (origin[1] + Math.floor(index / (size * size)) + 0.5) * cellBlocks;
      const z = (origin[2] + (Math.floor(index / size) % size) + 0.5) * cellBlocks;
      points[count * 3] = x;
      points[count * 3 + 1] = y;
      points[count * 3 + 2] = z;
      count += 1;
    }
    return {
      key: '',
      revision: reach.revision,
      points,
      rays: new Uint8Array(count),
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

  private surfaceAt(x: number, y: number, z: number, isBlocking: SolidAt): boolean {
    return (
      !isBlocking(x, y, z) &&
      (isBlocking(x - 1, y, z) ||
        isBlocking(x + 1, y, z) ||
        isBlocking(x, y - 1, z) ||
        isBlocking(x, y + 1, z) ||
        isBlocking(x, y, z - 1) ||
        isBlocking(x, y, z + 1))
    );
  }

  private build({ light, revision, rangeMetres, surface }: Entry, resolution: number): LampReach {
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
    const isBlocking: SolidAt = (x, y, z) => {
      const index = x - min[0] + extent * (z - min[2] + extent * (y - min[1]));
      let value = blocking[index]!;
      if (value === 0) {
        value = this.isBlocking(x, y, z) ? 2 : 1;
        blocking[index] = value;
      }
      return value === 2;
    };
    const receiver: Vec3 = [0, 0, 0];
    for (let index = 0; index < cells.length; index++) {
      const centre = receiver;
      centre[0] = (origin[0] + (index % size) + 0.5) * cellBlocks;
      centre[1] = (origin[1] + Math.floor(index / (size * size)) + 0.5) * cellBlocks;
      centre[2] = (origin[2] + (Math.floor(index / size) % size) + 0.5) * cellBlocks;
      const distance = Math.hypot(centre[0] - light.pos[0], centre[1] - light.pos[1], centre[2] - light.pos[2]);
      // Fixture masks retain their outside-range default; surface grids contain only tested receivers.
      if (distance > range) {
        continue;
      }
      if (surface) {
        if (this.surfaceAt(Math.floor(centre[0]), Math.floor(centre[1]), Math.floor(centre[2]), isBlocking)) {
          cells[index] = Number(reaches(light.pos, centre, isBlocking, light.body));
        }
      } else if (!reaches(light.pos, centre, isBlocking, light.body)) {
        cells[index] = 0;
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
