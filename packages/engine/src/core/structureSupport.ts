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

export interface SavedSupport {
  /** Cells whose standing block a player placed, sorted by y, x, z. */
  placed: Vec3[];
}

const keyOf = (cell: Readonly<Vec3>): string => cell.join(',');
const validCell = (cell: Readonly<Vec3>): boolean => cell.length === 3 && cell.every(Number.isSafeInteger);
const byRow = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[1] - b[1] || a[0] - b[0] || a[2] - b[2];

const warnRestoreIssue = (issue: string): void => {
  // biome-ignore lint/suspicious/noConsole: discarded corrupt save data must remain visible in diagnostics without a UI subscriber.
  console.warn(issue);
};

/**
 * World-owned support state that play produces. A placed mark lasts as long as the block placed with it, so any block
 * change at the cell ends it, as it ends the cell's damage.
 */
export class SupportState {
  private readonly placedCells = new Map<string, Vec3>();

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
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
    return freezeSnapshot({ placed: [...this.placedCells.values()].map((cell) => [...cell] as Vec3).sort(byRow) });
  }

  /** Columns are restored first. A mark on a cell with no solid block is reported and dropped. */
  restoreState(
    state: Readonly<SavedSupport>,
    registry: Registry,
    report: (issue: string) => void = warnRestoreIssue,
  ): string[] {
    if (this.placedCells.size > 0) {
      throw new Error('Cannot restore over support state');
    }
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
    for (const issue of issues) {
      report(issue);
    }
    return issues;
  }
}

/**
 * The live view of canonical terrain, with `placing` standing in for a block not yet published. Reads that leave the
 * world's height see air.
 */
export const terrainSupportView = (
  terrain: CanonicalTerrain,
  placing?: { readonly cell: Readonly<Vec3>; readonly block: number },
  read: (x: number, y: number, z: number) => number = (x, y, z) => terrain.getBlock(x, y, z),
): SupportView => {
  const { scale } = terrain.terrain;
  const minY = scale.minCy * CHUNK;
  const maxY = (scale.maxCy + 1) * CHUNK;
  const at = (x: number, y: number, z: number): boolean =>
    placing !== undefined && x === placing.cell[0] && y === placing.cell[1] && z === placing.cell[2];
  const block = (x: number, y: number, z: number): number => (at(x, y, z) ? placing!.block : read(x, y, z));
  return {
    minY,
    maxY,
    block,
    natural: (x, y, z) =>
      !(at(x, y, z) || terrain.world.support.isPlaced([x, y, z])) && block(x, y, z) === terrain.naturalBlock(x, y, z),
  };
};
