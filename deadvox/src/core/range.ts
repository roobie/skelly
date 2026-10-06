// The debug handling range shares geometry between generated sites; each caller supplies its bounds.

import { smoothstep } from './authoredTerrain.mjs';
import type { EntitySpec } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk } from './coords.ts';
import type { Scale } from './scale.ts';
import { type FurnitureSpawn, grow, type Rect, rectDistance } from './site.ts';
import type { Facing } from './templates.ts';
import { terrainHeight } from './worldgen.ts';

const HANDLING_RANGE = {
  gap: 8,
  blend: 8,
  length: 82,
  width: 40,
  firingLineOffset: 8,
  targetOffsets: [28, 48, 68],
  targetHalfWidth: 2,
  targetHeight: 4,
  tableOffset: 3,
} as const;

/** A firing lane and its worldgen additions, positioned beside a site's bounds. Coordinates are blocks. */
export class HandlingRange {
  readonly beside: Rect;
  readonly rect: Rect;
  readonly blend = HANDLING_RANGE.blend;
  readonly blendBounds: Rect;
  readonly floor: number;
  readonly firingLine: Rect;
  readonly targetXs: readonly number[];
  readonly table: EntitySpec;
  private readonly blocks: { asphalt: number; planks: number; hazard: number; brick: number };

  constructor(seed: number, registry: Registry, scale: Scale, { beside, floor }: { beside: Rect; floor?: number }) {
    const centreZ = Math.floor((beside.z0 + beside.z1) / 2);
    this.beside = { ...beside };
    const x0 = beside.x1 + HANDLING_RANGE.gap;
    this.rect = {
      x0,
      z0: centreZ - HANDLING_RANGE.width / 2,
      x1: x0 + HANDLING_RANGE.length,
      z1: centreZ + HANDLING_RANGE.width / 2,
    };
    this.blendBounds = grow(this.rect, this.blend);
    this.floor = floor ?? terrainHeight(seed, scale, Math.floor((this.rect.x0 + this.rect.x1) / 2), centreZ);
    const lineX = this.rect.x0 + HANDLING_RANGE.firingLineOffset;
    this.firingLine = {
      x0: lineX,
      z0: this.rect.z0 + 3,
      x1: lineX + 2,
      z1: this.rect.z1 - 3,
    };
    this.targetXs = HANDLING_RANGE.targetOffsets.map((offset) => x0 + offset);
    const tableType = 'range_table';
    const tableSize = registry.furniture.get(tableType)?.size;
    if (!tableSize) {
      throw new Error(`content does not define furniture "${tableType}"`);
    }
    this.table = {
      type: tableType,
      pos: [this.rect.x0 + HANDLING_RANGE.tableOffset, this.floor + 1, centreZ - 1],
      size: [...tableSize],
      facing: 's' satisfies Facing,
    };
    const block = (id: string): number => {
      const value = registry.blockIds.get(id);
      if (value === undefined) {
        throw new Error(`content does not define block "${id}"`);
      }
      return value;
    };
    this.blocks = {
      asphalt: block('asphalt'),
      planks: block('planks'),
      hazard: block('hazard_yellow'),
      brick: block('brick'),
    };
  }

  top(x: number, z: number): number | undefined {
    return rectDistance(this.firingLine, x, z) === 0 ? this.blocks.asphalt : undefined;
  }

  /** Blend the surrounding terrain into this range's level firing surface. */
  height(x: number, z: number, natural: number): number {
    const distance = rectDistance(this.rect, x, z);
    if (distance >= this.blend) {
      return natural;
    }
    const weight = smoothstep(1 - distance / this.blend);
    return Math.round(natural + weight * (this.floor - natural));
  }

  approachHeight(x: number, z: number, natural: number): number {
    const alongClearance = x >= this.beside.x1 && x < this.rect.x0 && z >= this.rect.z0 && z < this.rect.z1;
    return alongClearance ? this.floor : this.height(x, z, natural);
  }

  /** Writes the three backboards and posts wherever they intersect this chunk. */
  stamp(chunk: Chunk): void {
    const chunkX = chunk.cx * CHUNK;
    const chunkY = chunk.cy * CHUNK;
    const chunkZ = chunk.cz * CHUNK;
    const set = (x: number, y: number, z: number, id: number): void => {
      if (x >= chunkX && x < chunkX + CHUNK && y >= chunkY && y < chunkY + CHUNK && z >= chunkZ && z < chunkZ + CHUNK) {
        chunk.set(x - chunkX, y - chunkY, z - chunkZ, id);
      }
    };
    const centreZ = Math.floor((this.rect.z0 + this.rect.z1) / 2);
    for (const targetX of this.targetXs) {
      this.stampTarget(set, targetX, centreZ);
    }
  }

  private stampTarget(
    set: (x: number, y: number, z: number, id: number) => void,
    targetX: number,
    centreZ: number,
  ): void {
    for (let dz = -HANDLING_RANGE.targetHalfWidth; dz <= HANDLING_RANGE.targetHalfWidth; dz++) {
      for (let dy = 1; dy <= HANDLING_RANGE.targetHeight; dy++) {
        const edge = Math.abs(dz) === HANDLING_RANGE.targetHalfWidth || dy === 1 || dy === HANDLING_RANGE.targetHeight;
        const bullseye = Math.abs(dz) <= 1 && (dy === 2 || dy === 3);
        let block = this.blocks.hazard;
        if (bullseye) {
          block = this.blocks.brick;
        } else if (edge) {
          block = this.blocks.planks;
        }
        set(targetX, this.floor + dy, centreZ + dz, block);
      }
    }
    for (const dz of [-HANDLING_RANGE.targetHalfWidth - 1, HANDLING_RANGE.targetHalfWidth + 1]) {
      for (let dy = 0; dy < HANDLING_RANGE.targetHeight; dy++) {
        set(targetX, this.floor + dy, centreZ + dz, this.blocks.planks);
      }
    }
  }

  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    if (toChunk(this.table.pos[0]) !== cx || toChunk(this.table.pos[2]) !== cz) {
      return [];
    }
    return [{ spec: this.table, loot: [] }];
  }
}
