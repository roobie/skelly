import { expect, it } from 'vitest';
import { createTerrainEvaluator } from '../src/core/terrainEvaluator.ts';
import type { TerrainPlan } from '../src/core/terrainPlan.ts';

const fixture = (): TerrainPlan => ({
  seed: 7,
  scale: { blockSize: 1, minCy: 0, maxCy: 0 },
  blocks: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
  shape: {
    minHeightMetres: 0,
    maxHeightMetres: 0,
    beachBelowMetres: 0,
    dirtDepthMetres: 1,
    featureSizeMetres: 10,
    octaves: 1,
  },
  structures: [],
  site: {
    kind: 'authored',
    ground: {
      seed: 7,
      blockSize: 1,
      topography: {
        amplitudeMetres: 0,
        wavelengthMetres: 10,
        buildingMarginMetres: 0,
        roadShoulderMetres: 0,
        spawnMarginMetres: 0,
      },
      layout: { bounds: { x0: -10, x1: 10, z0: -10, z1: 10 }, ground: 0, terrain: [] },
      protectedBuildings: [],
      spawnPoints: [],
      lots: [],
      catalogue: undefined,
      tracks: [],
    },
    data: {
      catalogue: undefined,
      litter: 8,
      sand: 4,
      trees: [
        {
          shape: 'young',
          origin: [3, 1, 3],
          bounds: { x0: 3, x1: 4, z0: 3, z1: 4 },
          boxes: [{ min: [3, 1, 3], max: [4, 2, 4], block: 6 }],
        },
      ],
    },
    placements: [
      {
        origin: [1, 1, 1],
        turn: 0,
        template: { size: [2, 1, 1], blocks: new Uint16Array([7, 0]), ownership: new Uint8Array([1, 2]) },
      },
    ],
  },
});

it('rebuilds cloned tree and template data without sharing retained input buffers', () => {
  const plan = fixture();
  const clone = structuredClone(plan);
  if (plan.site.kind !== 'authored') {
    throw new Error('Expected authored fixture');
  }
  const input = plan.site.placements[0]!.template;
  const evaluator = createTerrainEvaluator(clone);
  expect(evaluator.generateChunk([0, 0, 0]).get(3, 1, 3)).toBe(6);
  expect(evaluator.generateChunk([0, 0, 0]).get(1, 1, 1)).toBe(7);
  input.blocks[0] = 9;
  input.ownership![0] = 0;
  expect(evaluator.generateChunk([0, 0, 0]).get(1, 1, 1)).toBe(7);
  expect(createTerrainEvaluator(plan).generateChunk([0, 0, 0]).get(1, 1, 1)).toBe(0);
});

it('keeps base fill distinct from fully stamped chunk and column operations', () => {
  const evaluator = createTerrainEvaluator(fixture());
  expect(evaluator.generateBaseChunk([0, 0, 0]).get(1, 1, 1)).toBe(0);
  const chunk = evaluator.generateChunk([0, 0, 0]);
  expect(chunk.get(1, 1, 1)).toBe(7);
  const column = evaluator.generateColumn(0, 0);
  expect(column[0]!.toArray()).toEqual(chunk.toArray());
  expect(column[0]!.revision).toBe(chunk.revision);
});

it('refuses an unknown mechanism instead of evaluating natural terrain', () => {
  const plan = fixture();
  expect(() =>
    createTerrainEvaluator({ ...plan, site: { kind: 'unsupported' } as unknown as TerrainPlan['site'] }),
  ).toThrow('Unknown terrain mechanism');
});
