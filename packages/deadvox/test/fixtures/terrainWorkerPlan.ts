import { makeScale, type TerrainPlan, type Vec3 } from '@skelly/engine/world';
import { baseTerrainShape } from '../baseRegistry.ts';

/** A block id past the terrain palette, as a content-added block resolves to. */
export const FIXTURE_BLOCK = 42;

export const workerPlanScale = { ...makeScale(0.5), minCy: 0, maxCy: 1 };

const templateBlocks = new Uint16Array(27);
templateBlocks.fill(FIXTURE_BLOCK, 0, 18);

/** Uneven ground with a box stage and a rotated template stage, so columns carry arrays, uniform chunks and stamps. */
export const workerPlan = (): TerrainPlan => ({
  seed: 17,
  blocks: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
  shape: { ...baseTerrainShape(), minHeightMetres: 2, maxHeightMetres: 14 },
  scale: workerPlanScale,
  site: {
    kind: 'natural',
    stamps: [
      { kind: 'boxes', boxes: [{ min: [-6, 20, 2], max: [30, 24, 5], block: FIXTURE_BLOCK }] },
      {
        kind: 'placements',
        placements: [{ template: { size: [3, 3, 3] as Vec3, blocks: templateBlocks }, origin: [5, 18, -7], turn: 1 }],
      },
    ],
  },
  structures: [],
});
