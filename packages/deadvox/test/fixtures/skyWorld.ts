import graphicsFile from '../../src/content/base/graphics.json' with { type: 'json' };
import siteGenerationFile from '../../src/content/base/site-generation.json' with { type: 'json' };
import { BlockEntities } from '../../src/core/blockEntities.ts';
import { Chunk } from '../../src/core/chunk.ts';
import { worldOpaque } from '../../src/core/collision.ts';
import { CORE_CONTENT_IDS } from '../../src/core/contentIds.ts';
import { CHUNK, toChunk, type Vec3 } from '../../src/core/coords.ts';
import { SKY_LOSS, type SkyBounds } from '../../src/core/skylight.ts';
import { World } from '../../src/core/world.ts';
import { buildFixtureRegistry as buildRegistry } from '../economyFixtures.ts';

function room(world: World, box: SkyBounds, wall: number): void {
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max.map((value) => value - 1) as Vec3;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1) {
          world.setBlock(x, y, z, wall);
        }
      }
    }
  }
}
export const fixtureBox: SkyBounds = { min: [4, 1, 4], max: [13, 10, 13] };
const baseSite = siteGenerationFile.siteGeneration[0] as (typeof siteGenerationFile.siteGeneration)[number];
export function skyWorldFixture(boxes: SkyBounds[] = [fixtureBox]) {
  const { registry } = buildRegistry([
    { source: 'graphics.json', data: graphicsFile },
    {
      source: 'sky-fixture.json',
      data: {
        blocks: [
          { id: 'fixture_wall', name: 'Fixture wall', color: '#888888', solid: true },
          { id: 'fixture_leaves', name: 'Fixture leaves', color: '#228844', solid: false, opaque: true },
        ],
        siteGeneration: [
          {
            id: CORE_CONTENT_IDS.authoredSite,
            topography: {
              amplitudeMetres: 0,
              wavelengthMetres: 1,
              buildingMarginMetres: 0,
              roadShoulderMetres: 0,
              spawnMarginMetres: 0,
            },
            terrain: baseSite.terrain,
            vegetation: {
              ...baseSite.vegetation,
              woodlandEdgeWavelengthMetres: 1,
              woodlandEdgeVariation: 0,
              openDensity: 0,
              obstacleMarginMetres: 0,
              treeMix: ['broadleaf'],
            },
            palette: {
              terrain: { grass: 'fixture_wall', dirt: 'fixture_wall', rock: 'fixture_wall', sand: 'fixture_wall' },
              paving: 'fixture_wall',
              trees: { trunk: 'fixture_wall', branch: 'fixture_wall', leaves: 'fixture_leaves' },
              leafLitter: 'fixture_leaves',
            },
            hamlet: { hedge: 'fixture_leaves', northSide: ['fixture_shell'], southSide: ['fixture_shell'] },
            placement: baseSite.placement,
          },
        ],
        templates: [
          {
            id: 'fixture_shell',
            size: [9, 9, 9],
            palette: { '.': 'air' },
            layers: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => '.'.repeat(9))),
          },
        ],
        furniture: [
          {
            id: 'fixture_door',
            name: 'Fixture door',
            size: [1, 1, 1],
            color: '#888888',
            door: {
              methods: {},
              handlingSimSeconds: 1,
            },
          },
        ],
      },
    },
  ]);
  const world = new World();
  const entities = new BlockEntities(registry);
  const wall = registry.blockIds.get('fixture_wall')!;
  const halo = Math.ceil(255 / SKY_LOSS) + 2;
  const x0 = Math.floor(Math.min(...boxes.map((box) => box.min[0] - halo)) / CHUNK);
  const x1 = Math.floor(Math.max(...boxes.map((box) => box.max[0] + halo)) / CHUNK);
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      world.addChunk(new Chunk(cx, 0, cz));
    }
  }
  for (const box of boxes) {
    room(world, box, wall);
  }
  const opaque = worldOpaque(world, registry, entities);
  const knownOpaque = (x: number, y: number, z: number) =>
    y < 0 || (y <= 31 && (!world.getChunk(toChunk(x), toChunk(y), toChunk(z)) || opaque(x, y, z)));
  return { world, entities, registry, wall, knownOpaque };
}
