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
    const next = new Map<string, Object3D>();
    const sources: BodyGlow[] = [];
    for (const cell of cells) {
      const [x, y, z] = cell;
      sources.push({
        position: [(x + 0.5) * blockSize, (y + 0.5) * blockSize, (z + 0.5) * blockSize],
        color: tuning.color,
        intensity: tuning.intensity,
        radiusMetres: tuning.radiusMetres,
      });
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
