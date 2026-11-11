import { smoothstep } from './authoredTerrain.mjs';
import { rectDistance as floorDistance, type Rect } from './site.ts';

export interface CatalogueFloor {
  readonly rect: Rect;
  readonly floor: number;
  readonly blend: number;
  readonly floorBlock: number;
}

export function catalogueHeight(data: CatalogueFloor, x: number, z: number, natural: number): number {
  const distance = floorDistance(data.rect, x, z);
  if (distance >= data.blend) {
    return natural;
  }
  return Math.round(natural + smoothstep(1 - distance / data.blend) * (data.floor - natural));
}

export function catalogueTop(data: CatalogueFloor, x: number, z: number): number | undefined {
  return floorDistance(data.rect, x, z) === 0 ? data.floorBlock : undefined;
}
