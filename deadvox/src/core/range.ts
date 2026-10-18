// The debug handling range shares geometry between generated sites; each caller supplies its bounds.

import { smoothstep } from './authoredTerrain.mjs';
import type { EntitySpec } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { CHUNK, toChunk } from './coords.ts';
import type { Scale } from './scale.ts';
import type { HandlingRangeDef } from './schema.ts';
import { type FurnitureSpawn, grow, type Rect, rectDistance } from './site.ts';
import { sitePalette, terrainShapeOf } from './sitePalette.ts';
import type { Facing } from './templates.ts';
import { terrainHeight } from './worldgen.ts';

/** The range layout content; its absence is reported by `requiredContentIssues`. */
const handlingRangeOf = (registry: Registry): HandlingRangeDef => {
  const layout = registry.handlingRange.get(CORE_CONTENT_IDS.testRange);
  if (!layout) {
    throw new Error(`content does not define handling range "${CORE_CONTENT_IDS.testRange}"`);
  }
  return layout;
};

/** A target's centre column in block coordinates; each target has its own lateral placement. */
export interface RangeTarget {
  readonly x: number;
  readonly z: number;
}

/** A firing lane and its worldgen additions, positioned beside a site's bounds. Coordinates are blocks. */
export class HandlingRange {
  readonly beside: Rect;
  readonly rect: Rect;
  readonly blend: number;
  readonly blendBounds: Rect;
  readonly floor: number;
  readonly firingLine: Rect;
  readonly targets: readonly RangeTarget[];
  readonly table: EntitySpec;
  private readonly layout: HandlingRangeDef;
  private readonly blocks: { asphalt: number; planks: number; hazard: number; brick: number };

  constructor(seed: number, registry: Registry, scale: Scale, { beside, floor }: { beside: Rect; floor?: number }) {
    const layout = handlingRangeOf(registry);
    this.layout = layout;
    this.blend = layout.blend;
    const centreZ = Math.floor((beside.z0 + beside.z1) / 2);
    this.beside = { ...beside };
    const x0 = beside.x1 + layout.gap;
    const halfWidth = Math.floor(layout.width / 2);
    this.rect = {
      x0,
      z0: centreZ - halfWidth,
      x1: x0 + layout.length,
      z1: centreZ - halfWidth + layout.width,
    };
    this.blendBounds = grow(this.rect, this.blend);
    this.floor =
      floor ??
      terrainHeight(seed, terrainShapeOf(registry), scale, Math.floor((this.rect.x0 + this.rect.x1) / 2), centreZ);
    const lineX = this.rect.x0 + layout.firingLine.offset;
    this.firingLine = {
      x0: lineX,
      z0: this.rect.z0 + layout.firingLine.inset,
      x1: lineX + layout.firingLine.depth,
      z1: this.rect.z1 - layout.firingLine.inset,
    };
    this.targets = layout.targets.map(({ offset, lateral }) => ({ x: x0 + offset, z: centreZ + lateral }));
    const tableType = 'range_table';
    const tableSize = registry.furniture.get(tableType)?.size;
    if (!tableSize) {
      throw new Error(`content does not define furniture "${tableType}"`);
    }
    this.table = {
      type: tableType,
      pos: [this.rect.x0 + layout.table.offset, this.floor + 1, centreZ + layout.table.lateral],
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
      asphalt: sitePalette(registry).paving,
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
    for (const target of this.targets) {
      this.stampTarget(set, target);
    }
  }

  private stampTarget(set: (x: number, y: number, z: number, id: number) => void, { x, z }: RangeTarget): void {
    const { halfWidth, height } = this.layout.target;
    for (let dz = -halfWidth; dz <= halfWidth; dz++) {
      for (let dy = 1; dy <= height; dy++) {
        const edge = Math.abs(dz) === halfWidth || dy === 1 || dy === height;
        const bullseye = Math.abs(dz) <= 1 && (dy === 2 || dy === 3);
        let block = this.blocks.hazard;
        if (bullseye) {
          block = this.blocks.brick;
        } else if (edge) {
          block = this.blocks.planks;
        }
        set(x, this.floor + dy, z + dz, block);
      }
    }
    for (const dz of [-halfWidth - 1, halfWidth + 1]) {
      for (let dy = 0; dy < height; dy++) {
        set(x, this.floor + dy, z + dz, this.blocks.planks);
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
