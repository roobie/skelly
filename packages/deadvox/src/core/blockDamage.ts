import type { BlockDamageKind } from './blockDamageKinds.ts';
import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import type { BlockMaterialDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { World } from './world.ts';

export interface BlockBlow {
  strength: number;
  kind: BlockDamageKind;
}

export interface BlockBash {
  outcome: 'resisted' | 'damaged' | 'broken';
  damage: number;
}

/** Resistance is a fraction removed before the strength gate, not a second durability pool. */
export const bashBlock = (cell: { material: BlockMaterialDef; damage: number }, blow: BlockBlow): BlockBash => {
  const { material, damage } = cell;
  if (
    !(
      Number.isFinite(blow.strength) &&
      blow.strength >= 0 &&
      Number.isFinite(damage) &&
      damage >= 0 &&
      damage <= material.durability
    )
  ) {
    throw new Error('Invalid block blow or damage');
  }
  const strength = blow.strength * (1 - material.resistance[blow.kind]);
  if (strength <= 0 || strength < material.minimumStrength) {
    return { outcome: 'resisted', damage };
  }
  const total = Math.min(material.durability, damage + strength);
  return { outcome: total === material.durability ? 'broken' : 'damaged', damage: total };
};

export interface DamageEntry {
  readonly damage: number;
  readonly epoch: number;
}

export interface SavedBlockDamage {
  nextEpoch: number;
  entries: { cell: Vec3; damage: number; epoch: number }[];
}

const warnRestoreIssue = (issue: string): void => {
  // biome-ignore lint/suspicious/noConsole: discarded corrupt save data must remain visible in diagnostics without a UI subscriber.
  console.warn(issue);
};

const keyOf = (cell: Readonly<Vec3>): string => cell.join(',');
const validCell = (cell: Readonly<Vec3>): boolean => cell.length === 3 && cell.every(Number.isSafeInteger);
const materialAt = (world: World, registry: Registry, cell: Readonly<Vec3>): BlockMaterialDef | undefined => {
  const [x, y, z] = cell;
  if (!world.getChunk(toChunk(x), toChunk(y), toChunk(z))) {
    return undefined;
  }
  const block = registry.blocks[world.getBlock(x, y, z)];
  return block?.solid ? registry.blockMaterials.get(block.material) : undefined;
};

/** World-owned damaged-cell identities. Full damage is retained until destruction is admitted. */
export class BlockDamage {
  private readonly entries = new Map<string, DamageEntry>();
  private nextEpoch = 1;

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  get(cell: Readonly<Vec3>): Readonly<DamageEntry> | undefined {
    return this.entries.get(keyOf(cell));
  }

  record(terrain: CanonicalTerrain, registry: Registry, cell: Readonly<Vec3>, damage: number): Readonly<DamageEntry> {
    if (terrain.world !== this.world || !validCell(cell)) {
      throw new Error('Invalid block damage world or cell');
    }
    const block = registry.blocks[terrain.getBlock(...cell)];
    const material = block?.solid ? registry.blockMaterials.get(block.material) : undefined;
    if (!(material && Number.isFinite(damage) && damage > 0 && damage <= material.durability)) {
      throw new Error('Invalid block damage');
    }
    const epoch = this.get(cell)?.epoch ?? this.nextEpoch;
    if (epoch === this.nextEpoch && this.nextEpoch >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Block damage epochs exhausted');
    }
    terrain.ensureCell(...cell);
    if (epoch === this.nextEpoch) {
      this.nextEpoch += 1;
    }
    const entry = Object.freeze({ damage, epoch });
    this.entries.set(keyOf(cell), entry);
    this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    return entry;
  }

  /** Replacement and completed repair end the identity, even when the same block is later rebuilt here. */
  clear(cell: Readonly<Vec3>): void {
    if (this.entries.delete(keyOf(cell))) {
      this.world.touchColumn(toChunk(cell[0]), toChunk(cell[2]));
    }
  }

  snapshotState(): Readonly<SavedBlockDamage> {
    const entries = [...this.entries].map(([key, entry]) => ({ cell: key.split(',').map(Number) as Vec3, ...entry }));
    entries.sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0] || a.cell[2] - b.cell[2]);
    return freezeSnapshot({ nextEpoch: this.nextEpoch, entries });
  }

  /** Columns are restored first. Corrupt entries are reported and dropped, never regenerated. */
  restoreState(
    state: Readonly<SavedBlockDamage>,
    registry: Registry,
    report: (issue: string) => void = warnRestoreIssue,
  ): string[] {
    if (this.entries.size > 0 || this.nextEpoch !== 1) {
      throw new Error('Cannot restore over block damage');
    }
    const issues: string[] = [];
    if (!Number.isSafeInteger(state.nextEpoch) || state.nextEpoch < 1) {
      throw new Error('Invalid next block damage epoch');
    }
    const epochs = new Set<number>();
    for (const { cell, damage, epoch } of state.entries) {
      const key = keyOf(cell);
      const material = validCell(cell) ? materialAt(this.world, registry, cell) : undefined;
      if (
        !(
          material &&
          Number.isFinite(damage) &&
          damage > 0 &&
          damage <= material.durability &&
          Number.isSafeInteger(epoch)
        ) ||
        epoch < 1 ||
        epoch >= state.nextEpoch ||
        epochs.has(epoch) ||
        this.entries.has(key)
      ) {
        issues.push(`Dropped invalid block damage at ${key}`);
        continue;
      }
      this.entries.set(key, Object.freeze({ damage, epoch }));
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
