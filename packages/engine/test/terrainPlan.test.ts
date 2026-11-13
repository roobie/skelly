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

it('preserves masked ground and ground markers while rotated owned air clears a cloned plan', () => {
  const plan = fixture();
  if (plan.site.kind !== 'authored') {
    throw new Error('Expected authored fixture');
  }
  const site: TerrainPlan['site'] = {
    ...plan.site,
    placements: [
      {
        origin: [1, 0, 1],
        turn: 1,
        template: {
          size: [4, 1, 1],
          blocks: new Uint16Array([9, 0, 9, 7]),
          ownership: new Uint8Array([0, 2, 1, 1]),
          ground: new Uint8Array([0, 0, 1, 0]),
        },
      },
    ],
  };
  const evaluator = createTerrainEvaluator(structuredClone({ ...plan, site }));
  const base = evaluator.generateBaseChunk([0, 0, 0]);
  const chunk = evaluator.generateChunk([0, 0, 0]);
  expect(base.get(1, 0, 1)).not.toBe(0);
  expect(chunk.get(1, 0, 1)).toBe(base.get(1, 0, 1));
  expect(base.get(1, 0, 2)).not.toBe(0);
  expect(chunk.get(1, 0, 2)).toBe(0);
  expect(chunk.get(1, 0, 3)).toBe(base.get(1, 0, 3));
  expect(chunk.get(1, 0, 4)).toBe(7);
});

it('retains highest water and catalogue, sand, first-track, litter top precedence after cloning', () => {
  const plan = fixture();
  if (plan.site.kind !== 'authored') {
    throw new Error('Expected authored fixture');
  }
  const polygon = (x0: number, x1: number): [number, number][] => [
    [x0, 0],
    [x1, 0],
    [x1, 2],
    [x0, 2],
  ];
  const catalogue = { rect: { x0: 0, x1: 1, z0: 0, z1: 1 }, floor: 0, blend: 1, floorBlock: 9 };
  const site: TerrainPlan['site'] = {
    ...plan.site,
    ground: {
      ...plan.site.ground,
      catalogue,
      layout: {
        ...plan.site.ground.layout,
        water: [
          { polygon: polygon(0, 3), level: 3, shore: 0 },
          { polygon: polygon(1, 4), level: 5, shore: 0 },
        ],
      },
      tracks: [10, 11].map((surface) => ({
        points: [
          [0, 0.5],
          [6, 0.5],
        ],
        width: 1,
        surface,
      })),
    },
    data: {
      ...plan.site.data,
      catalogue,
      trees: [{ shape: 'broadleaf', origin: [5, 1, 0], bounds: { x0: 0, x1: 9, z0: 0, z1: 2 }, boxes: [] }],
    },
    placements: [],
  };
  const evaluator = createTerrainEvaluator(structuredClone({ ...plan, site }));
  expect(evaluator.water(0, 0)).toBe(3);
  expect(evaluator.water(1, 0)).toBe(5);
  expect(evaluator.top(0, 0)).toBe(catalogue.floorBlock);
  expect(evaluator.top(1, 0)).toBe(plan.blocks.sand);
  expect(evaluator.top(5, 0)).toBe(10);
  expect(evaluator.top(7, 0)).toBe(plan.site.data.litter);
  expect(evaluator.top(9, 0)).toBeUndefined();
  const chunk = evaluator.generateChunk([0, 0, 0]);
  expect(chunk.get(1, 4, 0)).toBe(plan.blocks.water);
  expect(chunk.get(1, 5, 0)).toBe(0);
  expect(chunk.get(1, 0, 0)).toBe(plan.blocks.sand);
});

it('retains catalogue shaping and blends back to the authored ground after cloning', () => {
  const plan = fixture();
  if (plan.site.kind !== 'authored') {
    throw new Error('Expected authored fixture');
  }
  const catalogue = { rect: { x0: 0, x1: 2, z0: 0, z1: 2 }, floor: 6, blend: 2, floorBlock: 9 };
  const site: TerrainPlan['site'] = {
    ...plan.site,
    ground: { ...plan.site.ground, catalogue },
    data: { ...plan.site.data, catalogue },
    placements: [],
  };
  const evaluator = createTerrainEvaluator(structuredClone({ ...plan, site }));
  expect(evaluator.height(0, 0)).toBe(catalogue.floor);
  expect(evaluator.height(2, 0)).toBeGreaterThan(0);
  expect(evaluator.height(2, 0)).toBeLessThan(catalogue.floor);
  expect(evaluator.height(3, 0)).toBe(0);
  expect(evaluator.generateChunk([0, 0, 0]).get(0, catalogue.floor, 0)).toBe(catalogue.floorBlock);
});

it('retains spawn protection against topographic noise in a rebuilt cloned plan', () => {
  const plan = fixture();
  if (plan.site.kind !== 'authored') {
    throw new Error('Expected authored fixture');
  }
  const ground = {
    ...plan.site.ground,
    topography: { ...plan.site.ground.topography, amplitudeMetres: 20, spawnMarginMetres: 2 },
  };
  const unprotected = createTerrainEvaluator({ ...plan, site: { ...plan.site, ground } });
  const witness = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].find(([sampleX, sampleZ]) => unprotected.height(sampleX!, sampleZ!) !== 0);
  expect(witness).toBeDefined();
  const [x, z] = witness!;
  const site: TerrainPlan['site'] = {
    ...plan.site,
    ground: { ...ground, spawnPoints: [[x! + 0.5, z! + 0.5]] },
  };
  const protectedTerrain = createTerrainEvaluator(structuredClone({ ...plan, site }));
  expect(protectedTerrain.height(x!, z!)).toBe(0);
});

it('retains resolved deciduous litter footprints but excludes conifers after cloning', () => {
  const plan = fixture();
  const evaluator = createTerrainEvaluator(
    structuredClone({
      ...plan,
      site: {
        kind: 'forest-flat',
        data: {
          bounds: { x0: -4, x1: 8, z0: -4, z1: 4 },
          floor: 0,
          litter: 8,
          trees: [
            { shape: 'broadleaf', origin: [0, 1, 0], bounds: { x0: -2, x1: 2, z0: -2, z1: 2 }, boxes: [] },
            { shape: 'conifer', origin: [5, 1, 0], bounds: { x0: 4, x1: 7, z0: -2, z1: 2 }, boxes: [] },
          ],
        },
      },
    } satisfies TerrainPlan),
  );
  expect(evaluator.top(-2, -2)).toBe(8);
  expect(evaluator.top(1, 1)).toBe(8);
  expect(evaluator.top(2, 1)).toBeUndefined();
  expect(evaluator.top(5, 0)).toBeUndefined();
  expect(evaluator.generateChunk([0, 0, 0]).get(1, 0, 1)).toBe(8);
});

it('samples debug pad height and material at metre origins rather than cell centres after cloning', () => {
  const plan = fixture();
  const pad = { x0: 0.25, x1: 1.25, z0: -1, z1: 2 };
  const evaluator = createTerrainEvaluator(
    structuredClone({
      ...plan,
      site: {
        kind: 'weathering-pad',
        data: {
          blockSize: 1,
          padTop: 3,
          heightPad: pad,
          materialPad: pad,
          concrete: 9,
          structures: [],
        },
      },
    } satisfies TerrainPlan),
  );
  expect(evaluator.height(0, 0)).toBe(0);
  expect(evaluator.top(0, 0)).toBeUndefined();
  expect(evaluator.height(1, 0)).toBe(3);
  expect(evaluator.top(1, 0)).toBe(9);
  expect(evaluator.groundAt(0.5, 0.5)).toBe(1);
  expect(evaluator.groundAt(1.5, 0.5)).toBe(4);
  const chunk = evaluator.generateChunk([0, 0, 0]);
  expect(chunk.get(0, 3, 0)).toBe(0);
  expect(chunk.get(1, 3, 0)).toBe(9);
});

it('refuses an unknown mechanism instead of evaluating natural terrain', () => {
  const plan = fixture();
  expect(() =>
    createTerrainEvaluator({ ...plan, site: { kind: 'unsupported' } as unknown as TerrainPlan['site'] }),
  ).toThrow('Unknown terrain mechanism');
});
