import type { Vec3 } from '@skelly/engine/world';
import { Group, type Object3D } from 'three';
import type { BodyGlow } from './lightPool.ts';
import { ModelFlames } from './modelFlame.ts';

export interface TerrainFireTuning {
  readonly color: string;
  readonly intensity: number;
  readonly radiusMetres: number;
  readonly flame: { readonly heightMetres: number; readonly radiusMetres: number };
}

const FACES: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const cellKey = ([x, y, z]: Readonly<Vec3>): string => `${x},${y},${z}`;

const clusters = (cells: readonly Readonly<Vec3>[]): ReadonlyVec3[][] => {
  const pending = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const result: ReadonlyVec3[][] = [];
  while (pending.size > 0) {
    const first = pending.entries().next().value;
    if (!first) {
      break;
    }
    const [key, cell] = first;
    pending.delete(key);
    const cluster = [cell];
    for (const [x, y, z] of cluster) {
      for (const [nx, ny, nz] of FACES) {
        const neighbour = pending.get(cellKey([x + nx, y + ny, z + nz]));
        if (neighbour) {
          pending.delete(cellKey(neighbour));
          cluster.push(neighbour);
        }
      }
    }
    result.push(cluster);
  }
  return result;
};

type ReadonlyVec3 = Readonly<Vec3>;

/** Terrain's burning cells, drawn with the shared item-flame meshes rather than a second flame renderer. */
export class TerrainFire {
  readonly group = new Group();
  private readonly flames = new ModelFlames('terrain-fire-flame');
  private drawn = new Map<string, Object3D>();
  private sources: BodyGlow[] = [];

  sync(
    cells: Iterable<Readonly<Vec3>>,
    isOpaque: (x: number, y: number, z: number) => boolean,
    blockSize: number,
    tuning: TerrainFireTuning,
  ): void {
    const burning = [...cells];
    const next = new Map<string, Object3D>();
    const sources = clusters(burning).map((cluster) => {
      const centre = [0, 0, 0];
      for (const cell of cluster) {
        for (let axis = 0; axis < centre.length; axis++) {
          centre[axis]! += (cell[axis]! + 0.5) * blockSize;
        }
      }
      return {
        position: centre.map((coordinate) => coordinate / cluster.length) as [number, number, number],
        color: tuning.color,
        intensity: tuning.intensity,
        radiusMetres: tuning.radiusMetres,
      };
    });
    for (const cell of burning) {
      const [x, y, z] = cell;
      for (const [nx, ny, nz] of FACES) {
        if (isOpaque(x + nx, y + ny, z + nz)) {
          continue;
        }
        const key = `${x},${y},${z}:${nx},${ny},${nz}`;
        const flame = this.drawn.get(key) ?? this.flames.mesh(tuning.color);
        flame.scale.set(tuning.flame.radiusMetres, tuning.flame.heightMetres, tuning.flame.radiusMetres);
        flame.position.set(
          (x + 0.5 + nx * 0.5) * blockSize,
          (y + 0.5 + ny * 0.5 + tuning.flame.heightMetres / (2 * blockSize)) * blockSize,
          (z + 0.5 + nz * 0.5) * blockSize,
        );
        next.set(key, flame);
      }
    }
    for (const [key, flame] of this.drawn) {
      if (!next.has(key)) {
        flame.removeFromParent();
      }
    }
    for (const flame of next.values()) {
      if (!flame.parent) {
        this.group.add(flame);
      }
    }
    this.drawn = next;
    this.sources = sources;
  }

  lights(): readonly BodyGlow[] {
    return this.sources;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.flames.dispose();
  }
}
