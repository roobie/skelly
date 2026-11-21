// What holds a structure cell up (`packages/deadvox/SLICE-5.md`, "Support"). Natural ground holds. A structure cell is
// held when the solid cell under it holds, or when a straight sideways run of solid cells reaches, within the cell's
// own material span, a cell that natural ground or a held cell stands under. Support is derived from the standing
// blocks, so authored structure needs no saved state; the world saves only which cells a player placed, because a
// placed block is structure even where it matches the natural ground.

import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { World } from './world.ts';

/** Sideways run directions, in the fixed order every peer searches them. */
const SIDEWAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The cells a support judgement reads. */
export interface SupportView {
  /** The block id standing at a cell inside the world's height. */
  readonly block: (x: number, y: number, z: number) => number;
  /** Whether the solid block at a cell is untouched natural ground. */
  readonly natural: (x: number, y: number, z: number) => boolean;
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
  const span = registry.blocks.map((block) => registry.blockMaterials.get(block.material)?.span ?? 0);
  const standing = new Map<string, boolean>();
  const held = new Map<string, boolean>();
  const solidAt = (x: number, y: number, z: number): boolean =>
    y >= view.minY && y < view.maxY && solid[view.block(x, y, z)] === true;
  const holdsAt = (x: number, y: number, z: number): boolean =>
    solidAt(x, y, z) && (view.natural(x, y, z) || heldAt(x, y, z));
  /** Whether what is under a solid cell holds it. */
  const standsAt = (x: number, y: number, z: number): boolean => {
    const key = `${x},${y},${z}`;
    let answer = standing.get(key);
    if (answer === undefined) {
      answer = y - 1 < view.minY || holdsAt(x, y - 1, z);
      standing.set(key, answer);
    }
    return answer;
  };
  const sidewaysAt = (x: number, y: number, z: number): boolean => {
    const reach = span[view.block(x, y, z)] ?? 0;
    for (const [dx, dz] of SIDEWAYS) {
      for (let step = 1; step <= reach; step++) {
        const [nx, nz] = [x + dx * step, z + dz * step];
        if (!solidAt(nx, y, nz)) {
          break;
        }
        if (view.natural(nx, y, nz) || standsAt(nx, y, nz)) {
          return true;
        }
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

/** The widest span any material reaches, which bounds how far sideways a lost cell's dependants can be. */
const widestSpan = (registry: Registry): number =>
  [...registry.blockMaterials.values()].reduce((widest, { span }) => (span > widest ? span : widest), 0);

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
   * A cell stopped holding: it was broken, cleared or fell. Queues what may have depended on it: the cell above
   * first, then each sideways line out to the widest span. A cell is followed once per cascade.
   */
  lost(registry: Registry, cell: Readonly<Vec3>): void {
    const key = keyOf(cell);
    if (this.lostCells.has(key)) {
      return;
    }
    this.lostCells.set(key, [...cell] as Vec3);
    this.enqueue([cell[0], cell[1] + 1, cell[2]], true);
    this.enqueueSideways(registry, cell);
  }

  /** Queues the cells whose sideways run may pass through or end at `cell`. */
  enqueueSideways(registry: Registry, cell: Readonly<Vec3>): void {
    const reach = widestSpan(registry);
    for (const [dx, dz] of SIDEWAYS) {
      for (let step = 1; step <= reach; step++) {
        this.enqueue([cell[0] + dx * step, cell[1], cell[2] + dz * step], false);
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
    minY,
    maxY,
    block,
    natural: (x, y, z) =>
      !(at(x, y, z) || terrain.world.support.isPlaced([x, y, z])) && block(x, y, z) === terrain.naturalBlock(x, y, z),
  };
};
