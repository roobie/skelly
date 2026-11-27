// Authored support stays derived so exploration does not grow saves. Placed blocks need provenance because even a
// block matching natural ground is structure; see `packages/deadvox/SLICE-5.md`, "Support".

import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { World } from './world.ts';

/** Sideways run directions, in the fixed order every peer searches them. */
const BEARING_OFFSETS = { '-x': [-1, 0], '+x': [1, 0], '-z': [0, -1], '+z': [0, 1] } as const;

const SIDEWAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The cells a support judgement reads. */
export interface SupportView {
  readonly blockSize: number;
  /** The block id standing at a cell inside the world's height. */
  readonly block: (x: number, y: number, z: number) => number;
  /** Whether the solid block at a cell is untouched natural ground. */
  readonly natural: (x: number, y: number, z: number) => boolean;
  /** Vehicle occupancy must stop a drop without turning fittings into terrain blocks. */
  readonly externalSupport?: ((x: number, y: number, z: number) => boolean) | undefined;
  /** The lowest cell row; a cell on it stands on the world's floor. */
  readonly minY: number;
  /** One past the highest cell row. */
  readonly maxY: number;
}

export interface Support {
  /** Whether the cell's block holds what rests on it: natural ground, or a held structure cell. */
  readonly holds: (cell: Readonly<Vec3>) => boolean;
}

/**
 * One judgement over an unchanging view. Answers are memoised, and each depends only on rows below the cell and its
 * own row, so the search always ends and any order of questions gives the same answers.
 */
export const createSupport = (registry: Registry, view: SupportView): Support => {
  const solid = registry.blocks.map((block) => block.solid);
  const span = registry.blocks.map((block) =>
    Math.floor(
      ((block.loadPath?.kind === 'beam' ? block.loadPath.span : undefined) ??
        registry.blockMaterials.get(block.material)?.span ??
        0) / view.blockSize,
    ),
  );
  const bearings = registry.blocks.map((block) =>
    block.loadPath?.kind === 'strut' ? BEARING_OFFSETS[block.loadPath.bearing] : [0, 0],
  );
  const standing = new Map<string, boolean>();
  const held = new Map<string, boolean>();
  const solidAt = (x: number, y: number, z: number): boolean =>
    y >= view.minY && y < view.maxY && solid[view.block(x, y, z)] === true;
  const holdsAt = (x: number, y: number, z: number): boolean =>
    view.externalSupport?.(x, y, z) === true || (solidAt(x, y, z) && (view.natural(x, y, z) || heldAt(x, y, z)));
  /** Whether what is under a solid cell holds it. */
  const standsAt = (x: number, y: number, z: number): boolean => {
    const key = `${x},${y},${z}`;
    let answer = standing.get(key);
    if (answer === undefined) {
      const [dx, dz] = bearings[view.block(x, y, z)] ?? [0, 0];
      answer = y - 1 < view.minY || holdsAt(x + dx!, y - 1, z + dz!);
      standing.set(key, answer);
    }
    return answer;
  };
  const sidewaysAt = (x: number, y: number, z: number): boolean => {
    const reach = span[view.block(x, y, z)] ?? 0;
    const seen = new Set<string>([`${x},${z}`]);
    const open: [number, number, number][] = [[x, z, 0]];
    for (const [cx, cz, distance] of open) {
      if (distance >= reach) {
        continue;
      }
      const anchored = SIDEWAYS.some(([dx, dz]) => {
        const [nx, nz] = [cx + dx, cz + dz];
        const key = `${nx},${nz}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        if (!solidAt(nx, y, nz)) {
          return false;
        }
        if (view.natural(nx, y, nz) || standsAt(nx, y, nz)) {
          return true;
        }
        open.push([nx, nz, distance + 1]);
        return false;
      });
      if (anchored) {
        return true;
      }
    }
    return false;
  };
  /** A solid structure cell's own support. */
  const heldAt = (x: number, y: number, z: number): boolean => {
    const key = `${x},${y},${z}`;
    let answer = held.get(key);
    if (answer === undefined) {
      answer = standsAt(x, y, z) || sidewaysAt(x, y, z);
      held.set(key, answer);
    }
    return answer;
  };
  return { holds: ([x, y, z]) => holdsAt(x, y, z) };
};

/** A cell a cascade still has to judge, because a cell it may depend on stopped holding. */
export interface CascadeEntry {
  cell: Vec3;
  /** The cell under it stopped holding, so even if it stays held it may no longer anchor a run beside it. */
  lostFloor: boolean;
}

export interface SavedSupport {
  /** Cells whose standing block a player placed, sorted by y, x, z. */
  placed: Vec3[];
  /** Cells the running cascade still has to judge, in the order it judges them. */
  frontier: CascadeEntry[];
  /** Cells the running cascade has already seen stop holding, so none is followed twice; sorted by y, x, z. */
  lost: Vec3[];
}

const keyOf = (cell: Readonly<Vec3>): string => cell.join(',');
const validCell = (cell: Readonly<Vec3>): boolean => cell.length === 3 && cell.every(Number.isSafeInteger);
const byRow = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[1] - b[1] || a[0] - b[0] || a[2] - b[2];

const warnRestoreIssue = (issue: string): void => {
  // biome-ignore lint/suspicious/noConsole: discarded corrupt save data must remain visible in diagnostics without a UI subscriber.
  console.warn(issue);
};

/** Bounds sideways dependants, including block-authored member overrides. */
const widestSpan = (registry: Registry): number =>
  registry.blocks.reduce((widest, block) => {
    const span =
      (block.loadPath?.kind === 'beam' ? block.loadPath.span : undefined) ??
      registry.blockMaterials.get(block.material)?.span ??
      0;
    return Math.max(widest, span);
  }, 0);

/**
 * World-owned support state that play produces. A placed mark lasts as long as the block placed with it, so any block
 * change at the cell ends it, as it ends the cell's damage. A cascade is a first-in, first-out frontier of cells to
 * judge; it is saved, so a cascade cut short by its per-tick cap continues on the next tick and after a reload.
 */
export class SupportState {
  private readonly placedCells = new Map<string, Vec3>();
  private readonly frontier: CascadeEntry[] = [];
  private readonly queued = new Map<string, CascadeEntry>();
  private readonly lostCells = new Map<string, Vec3>();

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  /** Whether a cascade still has cells to judge. */
  get cascading(): boolean {
    return this.frontier.length > 0;
  }

  /** The next cell the cascade judges, left queued until `judged`. */
  next(): Readonly<CascadeEntry> | undefined {
    return this.frontier[0];
  }

  judged(): void {
    const entry = this.frontier.shift();
    if (entry) {
      this.queued.delete(keyOf(entry.cell));
    }
    if (this.frontier.length === 0) {
      this.lostCells.clear();
    }
  }

  /**
   * A cell stopped holding: queue its receivers in the row above, then its bounded same-row dependants.
   * A cell is followed once per cascade.
   */
  lost(registry: Registry, cell: Readonly<Vec3>, blockSize: number): void {
    const key = keyOf(cell);
    if (this.lostCells.has(key)) {
      return;
    }
    this.lostCells.set(key, [...cell] as Vec3);
    const bearings = new Set(
      registry.blocks.map((block) => (block.loadPath?.kind === 'strut' ? block.loadPath.bearing : undefined)),
    );
    for (const bearing of bearings) {
      const [dx, dz] = bearing ? BEARING_OFFSETS[bearing] : [0, 0];
      this.enqueue([cell[0] - dx!, cell[1] + 1, cell[2] - dz!], true);
    }
    this.enqueueSideways(registry, cell, blockSize);
  }

  /** A material replacement may lose span without losing solidity, so judge it as well as its dependants. */
  replaced(registry: Registry, cell: Readonly<Vec3>, blockSize: number): void {
    this.markPlaced(cell);
    this.enqueue([...cell] as Vec3, false);
    this.lost(registry, cell, blockSize);
  }

  /** Queues the cells whose sideways run may pass through or end at `cell`. */
  enqueueSideways(registry: Registry, cell: Readonly<Vec3>, blockSize: number): void {
    const reach = Math.floor(widestSpan(registry) / blockSize);
    for (let dx = -reach; dx <= reach; dx++) {
      const depth = reach - Math.abs(dx);
      for (let dz = -depth; dz <= depth; dz++) {
        if (dx !== 0 || dz !== 0) {
          this.enqueue([cell[0] + dx, cell[1], cell[2] + dz], false);
        }
      }
    }
  }

  private enqueue(cell: Vec3, lostFloor: boolean): void {
    const queued = this.queued.get(keyOf(cell));
    if (queued) {
      queued.lostFloor ||= lostFloor;
      return;
    }
    const entry = { cell, lostFloor };
    this.frontier.push(entry);
    this.queued.set(keyOf(cell), entry);
  }

  isPlaced(cell: Readonly<Vec3>): boolean {
    return this.placedCells.has(keyOf(cell));
  }

  /** Marks the block just placed at a cell, whose column is already installed. */
  markPlaced(cell: Readonly<Vec3>): void {
    if (!validCell(cell)) {
      throw new Error('Invalid placed cell');
    }
    this.placedCells.set(keyOf(cell), [...cell] as Vec3);
    this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
  }

  clear(cell: Readonly<Vec3>): void {
    this.placedCells.delete(keyOf(cell));
  }

  snapshotState(): Readonly<SavedSupport> {
    const cells = (from: Iterable<Vec3>) => [...from].map((cell) => [...cell] as Vec3).sort(byRow);
    return freezeSnapshot({
      placed: cells(this.placedCells.values()),
      frontier: this.frontier.map(({ cell, lostFloor }) => ({ cell: [...cell] as Vec3, lostFloor })),
      lost: cells(this.lostCells.values()),
    });
  }

  /**
   * Columns are restored first. A mark on a cell with no solid block is reported and dropped; a frontier cell needs no
   * block, since judging an empty cell ends there.
   */
  restoreState(
    state: Readonly<SavedSupport>,
    registry: Registry,
    report: (issue: string) => void = warnRestoreIssue,
  ): string[] {
    if (this.placedCells.size > 0 || this.frontier.length > 0 || this.lostCells.size > 0) {
      throw new Error('Cannot restore over support state');
    }
    const issues = [...this.restoreCascade(state), ...this.restorePlaced(state, registry)];
    for (const issue of issues) {
      report(issue);
    }
    return issues;
  }

  private restoreCascade(state: Readonly<SavedSupport>): string[] {
    const issues: string[] = [];
    for (const { cell, lostFloor } of state.frontier) {
      if (!validCell(cell) || this.queued.has(keyOf(cell))) {
        issues.push(`Dropped invalid cascade cell at ${keyOf(cell)}`);
        continue;
      }
      this.enqueue([...cell] as Vec3, lostFloor);
    }
    if (this.frontier.length > 0) {
      for (const cell of state.lost.filter(validCell)) {
        this.lostCells.set(keyOf(cell), [...cell] as Vec3);
      }
    }
    return issues;
  }

  private restorePlaced(state: Readonly<SavedSupport>, registry: Registry): string[] {
    const issues: string[] = [];
    for (const cell of state.placed) {
      const [x, y, z] = cell;
      const loaded = validCell(cell) && this.world.getChunk(toChunk(x), toChunk(y), toChunk(z)) !== undefined;
      if (!(loaded && registry.blocks[this.world.getBlock(x, y, z)]?.solid) || this.isPlaced(cell)) {
        issues.push(`Dropped invalid placed cell at ${keyOf(cell)}`);
        continue;
      }
      this.placedCells.set(keyOf(cell), [x, y, z]);
    }
    return issues;
  }
}

/**
 * The live view of canonical terrain, with `placing` standing in for a block not yet published. It reads only inside
 * the world's height, which `minY` and `maxY` bound.
 */
export const terrainSupportView = (
  terrain: CanonicalTerrain,
  placing?: { readonly cell: Readonly<Vec3>; readonly block: number },
): SupportView => {
  const { scale } = terrain.terrain;
  const minY = scale.minCy * CHUNK;
  const maxY = (scale.maxCy + 1) * CHUNK;
  const at = (x: number, y: number, z: number): boolean =>
    placing !== undefined && x === placing.cell[0] && y === placing.cell[1] && z === placing.cell[2];
  const block = (x: number, y: number, z: number): number => (at(x, y, z) ? placing!.block : terrain.getBlock(x, y, z));
  return {
    blockSize: scale.blockSize,
    minY,
    maxY,
    block,
    natural: (x, y, z) =>
      !(at(x, y, z) || terrain.world.support.isPlaced([x, y, z])) && block(x, y, z) === terrain.naturalBlock(x, y, z),
  };
};
