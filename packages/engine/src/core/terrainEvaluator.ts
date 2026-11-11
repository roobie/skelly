import { smoothstep } from './authoredTerrain.mjs';
import { createAuthoredGround, createAuthoredTerrain } from './authoredTerrainEvaluator.ts';
import type { Chunk } from './chunk.ts';
import { type CityPlan, cityRowStart } from './cityPlan.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { createForestTerrain } from './forestTerrainEvaluator.ts';
import { cityRowDepth } from './settlementPools.ts';
import { rectDistance } from './site.ts';
import { type BlockBox, stampChunk } from './structure.ts';
import { footprint, stampPlacement } from './templates.ts';
import type { TerrainPlacement, TerrainPlan } from './terrainPlan.ts';
import { createWeatheringTerrain } from './weatheringTerrainEvaluator.ts';
import { generateChunk, generateColumn, type Surface, terrainHeight, worldGroundAt } from './worldgen.ts';

export function stampCityTerrain(
  chunk: Chunk,
  structures: readonly BlockBox[],
  placements: readonly TerrainPlacement[],
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

export function createTerrainEvaluator(plan: TerrainPlan) {
  const { site } = plan;
  let evaluated: { surface?: Surface; stamp?: (chunk: Chunk) => void };
  switch (site.kind) {
    case 'natural':
      evaluated = {};
      break;
    case 'city': {
      const byColumn = new Map<string, TerrainPlacement[]>();
      for (const placement of site.placements) {
        const [width, depth] = footprint(placement);
        for (let cz = toChunk(placement.origin[2]); cz <= toChunk(placement.origin[2] + depth - 1); cz++) {
          for (let cx = toChunk(placement.origin[0]); cx <= toChunk(placement.origin[0] + width - 1); cx++) {
            const key = `${cx},${cz}`;
            const rows = byColumn.get(key) ?? [];
            rows.push(placement);
            byColumn.set(key, rows);
          }
        }
      }
      evaluated = {
        surface: createCitySurface(site.data, site.paving),
        stamp: (chunk) => stampCityTerrain(chunk, site.structures, byColumn.get(`${chunk.cx},${chunk.cz}`) ?? []),
      };
      break;
    }
    case 'authored':
      evaluated = createAuthoredTerrain({
        ...site.data,
        ground: createAuthoredGround(site.ground),
        placements: site.placements,
      });
      break;
    case 'forest-flat':
      evaluated = createForestTerrain(site.data);
      break;
    case 'weathering-pad':
      evaluated = createWeatheringTerrain(site.data);
      break;
    default:
      throw new Error(`Unknown terrain mechanism: ${String((site as { kind: unknown }).kind)}`);
  }
  const terrain = { ...plan, ...evaluated };
  const { surface } = evaluated;
  return {
    scale: plan.scale,
    height: (x: number, z: number) => {
      const natural = terrainHeight(plan.seed, plan.shape, plan.scale, x, z);
      return surface ? surface.height(x, z, natural) : natural;
    },
    top: (x: number, z: number) => surface?.top(x, z),
    water: (x: number, z: number) => surface?.water?.(x, z),
    groundAt: (xm: number, zm: number) => worldGroundAt({ ...plan, surface, xm, zm }),
    generateBaseChunk: (cell: Vec3) => generateChunk(terrain, cell),
    generateChunk: (cell: Vec3) => {
      const chunk = generateChunk(terrain, cell);
      stampChunk(chunk, plan.structures);
      evaluated.stamp?.(chunk);
      return chunk;
    },
    generateColumn: (cx: number, cz: number) => generateColumn(terrain, cx, cz, plan.structures),
  };
}

export type TerrainEvaluator = ReturnType<typeof createTerrainEvaluator>;
