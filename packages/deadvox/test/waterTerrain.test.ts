import { describe, expect, it } from 'vitest';
import { authoredLayoutIssues, inPolygon } from '../src/core/authoredLayout.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { profileHeight } from '../src/core/authoredTerrain.mjs';
import { CHUNK } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
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
  water: [{ level: 20, polygon: [[12, 10], [24, 10], [24, 30], [12, 30]], shore: 1 }],
  buildings: [],
  player: { position: [24, 20.5, 42], bearing: 0 },
  shamblers: [],
  woodlands: [],
  tracks: [],
  ...overrides,
});

describe('basin primitive', () => {
  const ground = 10;
  const hill = { kind: 'hill' as const, centre: [0, 0] as [number, number], radii: [8, 8] as [number, number], rise: 3 };
  const basin = { kind: 'basin' as const, centre: [0, 0] as [number, number], radii: [4, 4] as [number, number], depth: 2 };

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
  const columns = [0, 1, 2].flatMap((cx) => [0, 1, 2].map((cz) => [cx, cz] as const));
  const found: { x: number; y: number; z: number; below: number }[] = [];
  for (const [cx, cz] of columns) {
    const chunks = generateColumn({ seed: 5, blocks, shape, scale, surface: site.surface }, cx, cz);
    for (const chunk of chunks) {
      for (let ly = 0; ly < CHUNK; ly++) {
        for (let lz = 0; lz < CHUNK; lz++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            if (chunk.get(lx, ly, lz) !== blocks.water) {
              continue;
            }
            const y = chunk.cy * CHUNK + ly;
            const below = ly > 0 ? chunk.get(lx, ly - 1, lz) : chunks.find((c) => c.cy === chunk.cy - 1)!.get(lx, CHUNK - 1, lz);
            found.push({ x: cx * CHUNK + lx, y, z: cz * CHUNK + lz, below });
          }
        }
      }
    }
  }
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

describe('flooded lots', () => {
  const shed = registry.templates.get('shed')!;
  // The lot stands on the plain ground inside the extent; the level is above its standing surface.
  const flooded = (overWater: boolean) =>
    lakeLayout({
      terrain: [],
      water: [{ level: 22, polygon: [[2, 2], [30, 2], [30, 30], [2, 30]], shore: 1 }],
      buildings: [{ template: shed.id, position: [10, 20, 10], rotation: 0, ...(overWater ? { overWater } : {}) }],
    });

  it('rejects a lot whose apron stands below the level inside the extent, unless it is over water on purpose', () => {
    const issues = authoredLayoutIssues(flooded(false), registry);
    expect(issues.filter(([path, message]) => path === '.buildings[0]' && message.includes('flooded'))).toHaveLength(1);
    expect(authoredLayoutIssues(flooded(true), registry)).toEqual([]);
  });
});
