// Rubble is a material's fallen form as solid terrain: it gives cover and blocks paths until take apart
// clears it (`packages/deadvox/DESIGN.md`, "Damage, destruction and dismemberment"). A cell is rubble by the
// block standing in it, never by damage or repair state, so a rubble cell is not a damaged wall in another coat.

import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import type { DisassemblyOutput } from './disassembly.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { World } from './world.ts';

/** The blocks that are rubble: the fallen form some material names in `fallsTo`. */
export const rubbleBlockIds = (registry: Registry): ReadonlySet<string> =>
  new Set([...registry.blockMaterials.values()].map(({ fallsTo }) => fallsTo));

/** The rubble block standing at a cell, when rubble stands there in a loaded column. */
export const standingRubble = (world: World, registry: Registry, cell: Readonly<Vec3>): string | undefined => {
  const block = registry.blocks[world.getBlock(...cell)];
  return block && rubbleBlockIds(registry).has(block.id) ? block.id : undefined;
};

/** The yield clearing one rubble cell gives and the game minutes it takes, from its material's break yields. */
export interface RubbleClearWork {
  readonly outputs: DisassemblyOutput[];
  readonly timeGameMinutes: number;
}

/** Clearing yields the material's break yields, so rubble never gains a second yield table of its own. */
export const rubbleClearWork = (registry: Registry, block: string): RubbleClearWork | undefined => {
  const def = registry.blocks[registry.blockIds.get(block) ?? -1];
  const material = def && rubbleBlockIds(registry).has(block) ? registry.blockMaterials.get(def.material) : undefined;
  return material
    ? {
        outputs: material.rubble.map(({ item, count }) => ({ item, count })),
        timeGameMinutes: material.rubbleClearTimeGameMinutes,
      }
    : undefined;
};

/** A job clearing one rubble cell; the episode it pins was minted when the job began. */
export interface CellDisassemblyPlan extends RubbleClearWork {
  kind: 'cellDisassembly';
  cell: Vec3;
  /** The rubble block the job names; another block at the cell ends the job's target. */
  block: string;
  epoch: number;
}

/** The identity of one rubble episode at a cell: minted when work pins the cell, ended by any block change. */
export interface RubbleEpisode {
  readonly block: string;
  readonly epoch: number;
}

export interface SavedRubble {
  nextEpoch: number;
  /** The contents round extends each entry with the conserved items a collapse buried; this round pins identity only. */
  entries: { cell: Vec3; epoch: number }[];
}

const warnRestoreIssue = (issue: string): void => {
  // biome-ignore lint/suspicious/noConsole: discarded corrupt save data must remain visible in diagnostics without a UI subscriber.
  console.warn(issue);
};

const keyOf = (cell: Readonly<Vec3>): string => cell.join(',');
const validCell = (cell: Readonly<Vec3>): boolean => cell.length === 3 && cell.every(Number.isSafeInteger);

/**
 * World-owned rubble episodes. The standing block decides what is rubble; an entry only pins one cell's episode
 * so work holds an identity that ends when any block change replaces the cell, as replacement ends block damage.
 */
export class Rubble {
  private readonly entries = new Map<string, { cell: Vec3; epoch: number }>();
  private nextEpoch = 1;

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  /** The pinned episode's identity at a cell, where work has minted one. */
  get(cell: Readonly<Vec3>): number | undefined {
    return this.entries.get(keyOf(cell))?.epoch;
  }

  /** Pins the cell's episode for work, minting one where rubble stands unrecorded. */
  pin(registry: Registry, cell: Readonly<Vec3>): RubbleEpisode | undefined {
    if (!validCell(cell)) {
      return undefined;
    }
    const block = standingRubble(this.world, registry, cell);
    if (!block) {
      return undefined;
    }
    const existing = this.entries.get(keyOf(cell));
    if (existing) {
      return { block, epoch: existing.epoch };
    }
    if (this.nextEpoch >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Rubble episodes exhausted');
    }
    const entry = { cell: [...cell] as Vec3, epoch: this.nextEpoch };
    this.entries.set(keyOf(cell), entry);
    this.nextEpoch += 1;
    this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    return { block, epoch: entry.epoch };
  }

  /** Any block change at the cell ends its episode, as it ends the cell's damage identity. */
  clear(cell: Readonly<Vec3>): void {
    if (this.entries.delete(keyOf(cell))) {
      this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    }
  }

  snapshotState(): Readonly<SavedRubble> {
    const entries = [...this.entries].map(([key, entry]) => ({
      cell: key.split(',').map(Number) as Vec3,
      epoch: entry.epoch,
    }));
    entries.sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0] || a.cell[2] - b.cell[2]);
    return freezeSnapshot({ nextEpoch: this.nextEpoch, entries });
  }

  /** Columns are restored first. Corrupt entries are reported and dropped, never regenerated. */
  restoreState(
    state: Readonly<SavedRubble>,
    registry: Registry,
    report: (issue: string) => void = warnRestoreIssue,
  ): string[] {
    if (this.entries.size > 0 || this.nextEpoch !== 1) {
      throw new Error('Cannot restore over rubble episodes');
    }
    const issues: string[] = [];
    if (!Number.isSafeInteger(state.nextEpoch) || state.nextEpoch < 1) {
      throw new Error('Invalid next rubble episode');
    }
    const epochs = new Set<number>();
    for (const { cell, epoch } of state.entries) {
      const key = keyOf(cell);
      if (
        !(
          validCell(cell) &&
          standingRubble(this.world, registry, cell) !== undefined &&
          Number.isSafeInteger(epoch) &&
          epoch >= 1 &&
          epoch < state.nextEpoch &&
          !epochs.has(epoch) &&
          !this.entries.has(key)
        )
      ) {
        issues.push(`Dropped invalid rubble episode at ${key}`);
        continue;
      }
      this.entries.set(key, { cell: [...cell] as Vec3, epoch });
      epochs.add(epoch);
      this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    }
    this.nextEpoch = state.nextEpoch;
    for (const issue of issues) {
      report(issue);
    }
    return issues;
  }
}

/**
 * The world's say over clearing a rubble cell, bound to one world and registry by the game. Without `epoch` the
 * refusal judges only whether rubble stands there and nothing rests on it, as at a job's Start; with it, the
 * pinned episode must still be the one standing.
 */
export interface RubbleClearing {
  /** The rubble block standing at a cell, where rubble stands there and its column is loaded. */
  readonly standing: (cell: Readonly<Vec3>) => string | undefined;
  /** Pins the cell's rubble episode for a job, minting one where rubble stands unrecorded. */
  readonly pin: (cell: Readonly<Vec3>) => RubbleEpisode | undefined;
  readonly refusal: (cell: Readonly<Vec3>, epoch?: number) => string | undefined;
}

/** Binds the clearing owner to a world; `resting` names why something resting on the cell blocks clearing it. */
export const worldRubbleClearing = (
  world: World,
  registry: Registry,
  resting: (cell: Readonly<Vec3>) => string | undefined = () => undefined,
): RubbleClearing => {
  const refusal = (cell: Readonly<Vec3>, epoch?: number): string | undefined => {
    const block = standingRubble(world, registry, cell);
    if (!(block && (epoch === undefined || world.rubble.get(cell) === epoch))) {
      return coreMessage(registry, 'rubbleGone');
    }
    return resting(cell);
  };
  return {
    standing: (cell) => standingRubble(world, registry, cell),
    pin: (cell) => world.rubble.pin(registry, cell),
    refusal,
  };
};
