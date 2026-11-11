import { smoothstep } from './authoredTerrain.mjs';
import type { Chunk } from './chunk.ts';
import { type CityPlan, cityRowStart } from './cityPlan.ts';
import { CHUNK } from './coords.ts';
import { cityRowDepth } from './settlementPools.ts';
import { rectDistance } from './site.ts';
import { type BlockBox, stampChunk } from './structure.ts';
import { type Placement, stampPlacement } from './templates.ts';
import type { Surface } from './worldgen.ts';

export function stampCityTerrain(
  chunk: Chunk,
  structures: readonly BlockBox[],
  placements: readonly Placement[],
): void {
  stampChunk(chunk, structures);
  const y0 = chunk.cy * CHUNK;
  for (const placement of placements) {
    if (placement.origin[1] < y0 + CHUNK && placement.origin[1] + placement.template.size[1] > y0) {
      stampPlacement(chunk, placement);
    }
  }
}
export function createCitySurface(plan: Pick<CityPlan, 'grid' | 'bounds' | 'core' | 'floor'>, paving: number): Surface {
  const { grid, bounds, core, floor } = plan;
  const alleys = Array.from(
    { length: grid.rows / 2 - 1 },
    (_, pair) => cityRowStart(grid, pair * 2) + 2 * cityRowDepth(grid),
  );
  return {
    height: (x, z, natural) => {
      const distance = rectDistance(bounds, x, z);
      if (distance === 0) {
        return floor;
      }
      if (grid.flatSurroundings) {
        return floor;
      }
      if (distance >= grid.blend) {
        return natural;
      }
      return Math.round(natural + smoothstep(1 - distance / grid.blend) * (floor - natural));
    },
    top: (x, z) => {
      if (rectDistance(bounds, x, z) !== 0) {
        return;
      }
      if (grid.paving) {
        return grid.paving.some((rect) => rect.x0 <= x && x < rect.x1 && rect.z0 <= z && z < rect.z1)
          ? paving
          : undefined;
      }
      const central = (0 <= x && x < grid.street) || (0 <= z && z < grid.street);
      const localZ = mod(z, grid.street + grid.blockZ);
      const alley = alleys.some((start) => localZ >= start && localZ < start + grid.street);
      const street = mod(x, grid.street + grid.blockX) < grid.street || localZ < grid.street || alley;
      return central || (rectDistance(core, x, z) === 0 && street) ? paving : undefined;
    },
  };
}
const mod = (n: number, m: number) => ((n % m) + m) % m;
