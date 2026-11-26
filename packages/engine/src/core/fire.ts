import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { GameSeconds } from './time.ts';
import type { World } from './world.ts';

interface BurningCell {
  cell: Vec3;
  endsAtGameSeconds: number;
}

export interface SavedFire {
  timeGameSeconds: number;
  /** Queue order survives a capped tick and save/load. */
  entries: BurningCell[];
}

const keyOf = (cell: Readonly<Vec3>): string => cell.join(',');
const validCell = (cell: Readonly<Vec3>): boolean => cell.length === 3 && cell.every(Number.isSafeInteger);

const warnRestoreIssue = (issue: string): void => {
  // biome-ignore lint/suspicious/noConsole: corrupt save records must be visible even without a UI subscriber.
  console.warn(issue);
};

/** World ownership keeps burning independent of render residency, as damage and support are. */
export class Fire {
  private readonly entries = new Map<string, BurningCell>();
  private timeGameSeconds = 0;
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  get burning(): boolean {
    return this.entries.size > 0;
  }

  has(cell: Readonly<Vec3>): boolean {
    return this.entries.has(keyOf(cell));
  }

  /** Burning cells in ignition order; rendering may observe but never owns this state. */
  *cells(): IterableIterator<Readonly<Vec3>> {
    for (const { cell } of this.entries.values()) {
      yield cell;
    }
  }

  ignite(terrain: CanonicalTerrain, registry: Registry, cell: Readonly<Vec3>, strength: number): boolean {
    if (terrain.world !== this.world || !validCell(cell) || !Number.isFinite(strength) || strength < 0) {
      throw new Error('Invalid fire ignition');
    }
    const block = registry.blocks[terrain.getBlock(...cell)];
    const burn = block && registry.blockMaterials.get(block.material)?.flammability;
    if (!burn || strength <= burn.ignitionStrength || this.has(cell)) {
      return false;
    }
    terrain.ensureCell(...cell);
    this.entries.set(keyOf(cell), {
      cell: [...cell] as Vec3,
      endsAtGameSeconds: this.timeGameSeconds + burn.burnDurationGameMinutes,
    });
    this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    return true;
  }

  clear(cell: Readonly<Vec3>): void {
    this.entries.delete(keyOf(cell));
  }

  tick(
    terrain: CanonicalTerrain,
    registry: Registry,
    elapsedGameSeconds: GameSeconds,
    budget: number,
  ): { visited: number; edited: Vec3[] } {
    if (
      terrain.world !== this.world ||
      !Number.isFinite(elapsedGameSeconds) ||
      elapsedGameSeconds < 0 ||
      !Number.isSafeInteger(budget) ||
      budget < 1
    ) {
      throw new Error('Invalid fire tick');
    }
    this.timeGameSeconds += elapsedGameSeconds;
    // Taking only the bounded prefix prevents cycling around to a cell twice in the same tick.
    const pending: BurningCell[] = [];
    for (const entry of this.entries.values()) {
      pending.push(entry);
      if (pending.length >= budget) {
        break;
      }
    }
    const edited: Vec3[] = [];
    for (const entry of pending) {
      const key = keyOf(entry.cell);
      this.entries.delete(key);
      if (entry.endsAtGameSeconds > this.timeGameSeconds) {
        this.entries.set(key, entry);
        continue;
      }
      const block = registry.blocks[terrain.getBlock(...entry.cell)];
      const burn = block && registry.blockMaterials.get(block.material)?.flammability;
      const result = burn && registry.blockIds.get(burn.burnsTo);
      if (result === undefined) {
        throw new Error('Burning cell has no exhaustion block');
      }
      edited.push(...this.world.setBlock(...entry.cell, result));
      this.world.support.replaced(registry, entry.cell);
    }
    return { visited: pending.length, edited };
  }

  snapshotState(): Readonly<SavedFire> {
    return freezeSnapshot({
      timeGameSeconds: this.timeGameSeconds,
      entries: [...this.entries.values()].map((entry) => ({ ...entry, cell: [...entry.cell] as Vec3 })),
    });
  }

  restoreState(
    state: Readonly<SavedFire>,
    registry: Registry,
    report: (issue: string) => void = warnRestoreIssue,
  ): string[] {
    if (this.burning || this.timeGameSeconds !== 0) {
      throw new Error('Cannot restore over fire');
    }
    if (!Number.isFinite(state.timeGameSeconds) || state.timeGameSeconds < 0) {
      throw new Error('Invalid fire clock');
    }
    this.timeGameSeconds = state.timeGameSeconds;
    const issues: string[] = [];
    for (const { cell, endsAtGameSeconds } of state.entries) {
      const loaded =
        validCell(cell) && this.world.getChunk(toChunk(cell[0]), toChunk(cell[1]), toChunk(cell[2])) !== undefined;
      const block = loaded ? registry.blocks[this.world.getBlock(...cell)] : undefined;
      const valid =
        block &&
        registry.blockMaterials.get(block.material)?.flammability &&
        Number.isFinite(endsAtGameSeconds) &&
        endsAtGameSeconds >= 0;
      if (!valid || this.has(cell)) {
        issues.push(`Dropped invalid burning cell at ${keyOf(cell)}`);
        continue;
      }
      this.entries.set(keyOf(cell), { cell: [...cell] as Vec3, endsAtGameSeconds });
      this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    }
    for (const issue of issues) {
      report(issue);
    }
    return issues;
  }
}
