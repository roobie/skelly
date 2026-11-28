import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface SmokeTuning {
  grainBlocks: number;
  stepGameSeconds: number;
  emissionPerGameSecond: number;
  riseFraction: number;
  decayFraction: number;
  cutoff: number;
  sightDepth: number;
}

interface Sample {
  cell: Vec3;
  density: number;
}

export interface SavedSmoke {
  remainderGameSeconds: number;
  entries: Sample[];
  pending: Sample[];
}

const keyOf = (cell: Readonly<Vec3>): string => cell.join(',');
const order = (a: Pick<Sample, 'cell'>, b: Pick<Sample, 'cell'>): number =>
  a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1] || a.cell[2] - b.cell[2];
const neighbours: readonly Vec3[] = [
  [0, 1, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/** Amount in air, independent of publication, physical ray queries and flame presentation. */
export class Smoke {
  private entries = new Map<string, Sample>();
  private readonly pending = new Map<string, Sample>();
  private remainderGameSeconds = 0;
  version = 0;

  get active(): boolean {
    return this.entries.size > 0 || this.pending.size > 0;
  }

  samples(): IterableIterator<Sample> {
    return this.entries.values();
  }

  private add(target: Map<string, Sample>, cell: Vec3, density: number): void {
    if (density <= 0) {
      return;
    }
    const key = keyOf(cell);
    const previous = target.get(key);
    if (previous) {
      previous.density += density;
    } else {
      target.set(key, { cell, density });
    }
  }

  /** Integrates source intervals before capped exhaustion may remove their fire entries. */
  advance({
    terrain,
    registry,
    tuning,
    elapsedGameSeconds,
    sources,
  }: {
    terrain: CanonicalTerrain;
    registry: Registry;
    tuning: SmokeTuning;
    elapsedGameSeconds: number;
    sources: readonly { cell: Vec3; remainingGameSeconds: number }[];
  }): void {
    if (!Number.isFinite(elapsedGameSeconds) || elapsedGameSeconds < 0) {
      throw new Error('Invalid smoke advance');
    }
    const grain = tuning.grainBlocks;
    const minY = terrain.terrain.scale.minCy * CHUNK;
    const maxY = (terrain.terrain.scale.maxCy + 1) * CHUNK;
    const free = (cell: Vec3): boolean => {
      const y = cell[1] * grain;
      return (
        y >= minY &&
        y < maxY &&
        !registry.blocks[terrain.getBlock(Math.floor(cell[0] * grain), Math.floor(y), Math.floor(cell[2] * grain))]!
          .solid
      );
    };
    const sorted = [...sources].sort(order);
    let advancedGameSeconds = 0;
    while (advancedGameSeconds < elapsedGameSeconds) {
      const durationGameSeconds = Math.min(
        elapsedGameSeconds - advancedGameSeconds,
        tuning.stepGameSeconds - this.remainderGameSeconds,
      );
      for (const source of sorted) {
        this.emit({ source, advancedGameSeconds, durationGameSeconds, tuning, free });
      }
      advancedGameSeconds += durationGameSeconds;
      this.remainderGameSeconds += durationGameSeconds;
      if (this.remainderGameSeconds >= tuning.stepGameSeconds) {
        this.step(tuning, free);
      }
    }
  }

  private emit({
    source,
    advancedGameSeconds,
    durationGameSeconds,
    tuning,
    free,
  }: {
    source: { cell: Vec3; remainingGameSeconds: number };
    advancedGameSeconds: number;
    durationGameSeconds: number;
    tuning: SmokeTuning;
    free: (cell: Vec3) => boolean;
  }): void {
    const emitting = Math.max(0, Math.min(durationGameSeconds, source.remainingGameSeconds - advancedGameSeconds));
    if (emitting === 0) {
      return;
    }
    const destinations = neighbours
      .map(
        (offset): Vec3 => [
          Math.floor((source.cell[0] + 0.5 + offset[0]) / tuning.grainBlocks),
          Math.floor((source.cell[1] + 0.5 + offset[1]) / tuning.grainBlocks),
          Math.floor((source.cell[2] + 0.5 + offset[2]) / tuning.grainBlocks),
        ],
      )
      .filter(free);
    for (const cell of destinations) {
      this.add(this.pending, cell, (emitting * tuning.emissionPerGameSecond) / destinations.length);
    }
  }

  private step(tuning: SmokeTuning, free: (cell: Vec3) => boolean): void {
    // A separate destination buffer forbids one sample rising several layers in the same step.
    const next = new Map<string, Sample>();
    for (const sample of [...this.pending.values()].sort(order)) {
      this.add(this.entries, sample.cell, sample.density);
    }
    this.pending.clear();
    for (const { cell, density } of [...this.entries.values()].sort(order)) {
      if (!free(cell)) {
        continue;
      }
      const remaining = density * (1 - tuning.decayFraction);
      const above: Vec3 = [cell[0], cell[1] + 1, cell[2]];
      const rising = free(above) ? remaining * tuning.riseFraction : 0;
      this.add(next, cell, remaining - rising);
      this.add(next, above, rising);
    }
    for (const [key, sample] of next) {
      if (sample.density < tuning.cutoff) {
        next.delete(key);
      }
    }
    this.entries = next;
    this.remainderGameSeconds = 0;
    this.version += 1;
  }

  /** Segment lengths include the observer and source cells; hard-wall endpoint exemptions do not apply. */
  opticalDepth(origin: Readonly<Vec3>, target: Readonly<Vec3>, grain: number, blockSize: number): number {
    if (this.entries.size === 0) {
      return 0;
    }
    const delta: Vec3 = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
    const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]) * blockSize;
    const cell = origin.map((v) => Math.floor(v / grain)) as Vec3;
    const step = delta.map(Math.sign) as Vec3;
    const stride = delta.map((v) => (v === 0 ? Number.POSITIVE_INFINITY : grain / Math.abs(v))) as Vec3;
    const boundary = delta.map((v, axis) =>
      v === 0 ? Number.POSITIVE_INFINITY : ((cell[axis]! + (v > 0 ? 1 : 0)) * grain - origin[axis]!) / v,
    ) as Vec3;
    let depth = 0;
    let start = 0;
    while (start < 1) {
      const end = Math.min(1, ...boundary);
      depth += (this.entries.get(keyOf(cell))?.density ?? 0) * (end - start) * length;
      if (end >= 1) {
        break;
      }
      for (let axis = 0; axis < 3; axis++) {
        if (boundary[axis] === end) {
          cell[axis]! += step[axis]!;
          boundary[axis]! += stride[axis]!;
        }
      }
      start = end;
    }
    return depth;
  }

  snapshotState(): Readonly<SavedSmoke> {
    return freezeSnapshot({
      remainderGameSeconds: this.remainderGameSeconds,
      entries: structuredClone([...this.entries.values()].sort(order)),
      pending: structuredClone([...this.pending.values()].sort(order)),
    });
  }

  restoreState(state: Readonly<SavedSmoke>, tuning?: SmokeTuning): void {
    if (this.active || this.remainderGameSeconds !== 0) {
      throw new Error('Cannot restore over smoke');
    }
    if (!tuning) {
      if (state.entries.length > 0 || state.pending.length > 0 || state.remainderGameSeconds !== 0) {
        throw new Error('Saved smoke needs fire tuning');
      }
      return;
    }
    if (
      !(
        Number.isFinite(state.remainderGameSeconds) &&
        state.remainderGameSeconds >= 0 &&
        state.remainderGameSeconds < tuning.stepGameSeconds
      )
    ) {
      throw new Error('Invalid smoke remainder');
    }
    for (const [target, entries] of [
      [this.entries, state.entries],
      [this.pending, state.pending],
    ] as const) {
      for (const { cell, density } of entries) {
        if (
          cell.length !== 3 ||
          !cell.every(Number.isSafeInteger) ||
          !Number.isFinite(density) ||
          density <= 0 ||
          target.has(keyOf(cell))
        ) {
          throw new Error('Invalid smoke sample');
        }
        target.set(keyOf(cell), { cell: [...cell] as Vec3, density });
      }
    }
    this.remainderGameSeconds = state.remainderGameSeconds;
    this.version += 1;
  }
}
