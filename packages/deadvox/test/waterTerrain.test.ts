import { describe, expect, it } from 'vitest';
import { authoredLayoutIssues, inPolygon } from '../src/core/authoredLayout.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { profileHeight } from '../src/core/authoredTerrain.mjs';
import { CHUNK } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import { World } from '../src/core/world.ts';
import { generateChunk, generateColumn, terrainHeight } from '../src/core/worldgen.ts';
import { baseRegistry } from './baseRegistry.ts';

const scale = makeScale(0.5);
const registry = baseRegistry();
const blocks = sitePalette(registry).terrain;
const shape = terrainShapeOf(registry);

const lakeLayout = (overrides: Partial<SiteLayoutDef> = {}): SiteLayoutDef => ({
  id: 'water_fixture',
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  bounds: { x0: 0, z0: 0, x1: 48, z1: 48 },
  ground: 20,
  terrain: [{ kind: 'basin', centre: [24, 20], radii: [10, 8], depth: 3 }],
  // The polygon covers only the basin's west half, so the extent, not the terrain, bounds the east shore.
  water: [
    {
      level: 20,
      polygon: [
        [12, 10],
        [24, 10],
        [24, 30],
        [12, 30],
      ],
      shore: 1,
    },
  ],
  buildings: [],
  player: { position: [24, 20.5, 42], bearing: 0 },
  shamblers: [],
  woodlands: [],
  tracks: [],
  ...overrides,
});

/** Every water cell in the world's columns over [0, side)², at every height the world spans. */
const waterCells = (world: World, side: number): { x: number; y: number; z: number }[] => {
  const out: { x: number; y: number; z: number }[] = [];
  for (let y = scale.minCy * CHUNK; y < (scale.maxCy + 1) * CHUNK; y++) {
    for (let z = 0; z < side; z++) {
      for (let x = 0; x < side; x++) {
        if (world.getBlock(x, y, z) === blocks.water) {
          out.push({ x, y, z });
        }
      }
    }
  }
  return out;
};

describe('basin primitive', () => {
  const ground = 10;
  const hill = {
    kind: 'hill' as const,
    centre: [0, 0] as [number, number],
    radii: [8, 8] as [number, number],
    rise: 3,
  };
  const basin = {
    kind: 'basin' as const,
    centre: [0, 0] as [number, number],
    radii: [4, 4] as [number, number],
    depth: 2,
  };

  it('lowers the profile inside its radii and leaves it alone outside', () => {
    expect(profileHeight({ ground, terrain: [basin] }, 0, 0)).toBeLessThan(ground);
    expect(profileHeight({ ground, terrain: [basin] }, 5, 0)).toBe(ground);
  });

  it('cuts a hill it overlaps by its depth: ground plus rise minus depth at a shared centre', () => {
    expect(profileHeight({ ground, terrain: [hill, basin] }, 0, 0)).toBe(ground + hill.rise - basin.depth);
  });
});

describe('water fill rule', () => {
  const bed = 40; // top ground block, in blocks, inside chunk layer 1
  const waterLayers = (level: number): number[] => {
    const chunk = generateChunk(
      { seed: 1, blocks, shape, scale, surface: { height: () => bed, top: () => undefined, water: () => level } },
      [0, 1, 0],
    );
    const layers: number[] = [];
    for (let y = 0; y < CHUNK; y++) {
      if (chunk.get(3, y, 5) === blocks.water) {
        layers.push(CHUNK + y);
      }
    }
    return layers;
  };

  it("leaves a column dry when the level is its bed's top face, and fills one layer a block higher", () => {
    expect(waterLayers(bed + 1)).toEqual([]);
    expect(waterLayers(bed + 2)).toEqual([bed + 1]);
  });
});

describe('authored water', () => {
  const layout = lakeLayout();
  const site = new AuthoredSite(5, registry, scale, layout);
  const s = scale.blockSize;
  const world = new World();
  for (const cx of [0, 1, 2]) {
    for (const cz of [0, 1, 2]) {
      for (const chunk of generateColumn({ seed: 5, blocks, shape, scale, surface: site.surface }, cx, cz)) {
        world.addChunk(chunk);
      }
    }
  }
  const found = waterCells(world, 3 * CHUNK).map((cell) => ({
    ...cell,
    below: world.getBlock(cell.x, cell.y - 1, cell.z),
  }));
  const level = layout.water![0]!.level / s;

  it('places every water block inside the polygon, above its bed and below the level', () => {
    expect(found.length).toBeGreaterThan(0);
    for (const { x, y, z } of found) {
      expect(inPolygon([(x + 0.5) * s, (z + 0.5) * s], layout.water![0]!.polygon)).toBe(true);
      const bedTop = site.surface.height(x, z, terrainHeight(5, shape, scale, x, z));
      expect(y).toBeGreaterThanOrEqual(bedTop + 1);
      expect(y).toBeLessThan(level);
    }
  });

  it('lays the bed under the water in sand', () => {
    const beds = found.filter(({ below }) => below !== blocks.water);
    expect(beds.length).toBeGreaterThan(0);
    expect(beds.every(({ below }) => below === blocks.sand)).toBe(true);
  });
});

describe('water validation at any size', () => {
  const holdsNoWater = (layout: SiteLayoutDef) =>
    authoredLayoutIssues(layout, registry).filter(
      ([path, message]) => path === '.water[0]' && message.includes('holds no water'),
    );
  const square = (x0: number, x1: number): [number, number][] => [
    [x0, x0],
    [x1, x0],
    [x1, x1],
    [x0, x1],
  ];

  it('accepts a lake kilometres across, so the check has no hidden size cap', () => {
    const side = 20_000;
    const lake = lakeLayout({
      bounds: { x0: 0, z0: 0, x1: side, z1: side },
      terrain: [{ kind: 'basin', centre: [side / 2, side / 2], radii: [side * 0.4, side * 0.3], depth: 8 }],
      water: [{ level: 20, polygon: square(side * 0.05, side * 0.95), shore: 1 }],
      player: { position: [side / 2, 20.5, side * 0.98], bearing: 0 },
    });
    expect(authoredLayoutIssues(lake, registry)).toEqual([]);
  });

  it('still finds a puddle one cell wide in a wide polygon, and reports a polygon with none', () => {
    const wide = (terrain: SiteLayoutDef['terrain']) =>
      lakeLayout({
        bounds: { x0: 0, z0: 0, x1: 180, z1: 180 },
        terrain,
        water: [{ level: 20, polygon: square(10, 170), shore: 1 }],
        player: { position: [90, 20.5, 175], bearing: 0 },
      });
    // Off every coarse stride's lattice, and too small to reach the cells beside it.
    const puddle = {
      kind: 'basin' as const,
      centre: [101.75, 77.25] as [number, number],
      radii: [0.3, 0.3] as [number, number],
      depth: 3,
    };
    expect(holdsNoWater(wide([puddle]))).toEqual([]);
    expect(holdsNoWater(wide([]))).toHaveLength(1);
  });
});

describe('flooded lots', () => {
  const shed = registry.templates.get('shed')!;
  // The lot stands on the plain ground inside the extent; the level is above its standing surface.
  const flooded = (overWater: boolean) =>
    lakeLayout({
      terrain: [],
      water: [
        {
          level: 22,
          polygon: [
            [2, 2],
            [30, 2],
            [30, 30],
            [2, 30],
          ],
          shore: 1,
        },
      ],
      buildings: [{ template: shed.id, position: [10, 20, 10], rotation: 0, ...(overWater ? { overWater } : {}) }],
    });

  it('rejects a lot whose apron stands below the level inside the extent, unless it is over water on purpose', () => {
    const issues = authoredLayoutIssues(flooded(false), registry);
    expect(issues.filter(([path, message]) => path === '.buildings[0]' && message.includes('flooded'))).toHaveLength(1);
    expect(authoredLayoutIssues(flooded(true), registry)).toEqual([]);
  });
});
