import { describe, expect, it } from 'vitest';
import { authoredLayoutIssues } from '../src/core/authoredLayout.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { CONTACT_SKIN, stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, TemplateDef } from '../src/core/schema.ts';
import { terrainShapeOf } from '../src/core/sitePalette.ts';
import { templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate, placedPoint, type Turn } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createPlayerBody, physicsFor } from './playerFixture.ts';

const base = baseRegistry();
const definition = (): TemplateDef => ({
  id: 'fixture_stairs',
  lootContext: { tier: 'Tier1', usage: ['Residential'] },
  size: [16, 15, 12],
  palette: { '.': 'air', p: 'planks' },
  layers: Array.from({ length: 15 }, (_layer, y) =>
    Array.from({ length: 12 }, (_row, z) =>
      Array.from({ length: 16 }, (_cell, x) => {
        if ([0, 8, 14].includes(y)) {
          return 'p';
        }
        if (z === 0 && [2, 3].includes(x) && [1, 2, 3, 4, 9, 10, 11, 12].includes(y)) {
          return '.';
        }
        return x === 0 || x === 15 || z === 0 || z === 11 ? 'p' : '.';
      }).join(''),
    ),
  ),
  access: {
    ground: 'upper',
    entrance: [3, 9, 2],
    storeys: [
      { id: 'lower', floor: 1 },
      { id: 'upper', floor: 9 },
    ],
    stairs: [{ from: 'lower', to: 'upper', lower: [2, 1, 4], upper: [11, 9, 4], width: 2, block: 'planks' }],
  },
});
// The same flight serves as an above-ground stair or a cellar by choosing its ground storey.
const house = () => {
  const def = definition();
  def.access!.ground = 'lower';
  def.access!.entrance = [3, 1, 2];
  return compileTemplate(base, def);
};
const registry = { ...base, templates: new Map([[definition().id, definition()]]) };
const layoutFixture = (): SiteLayoutDef => ({
  id: 'fixture_layout',
  lootContext: definition().lootContext,
  demo: true,
  bounds: { x0: 32, x1: 96, z0: 32, z1: 96 },
  ground: 17,
  buildings: [{ template: definition().id, position: [59.5, 17, 59.5], rotation: 0 }],
  player: { position: [40, 17.5, 40], bearing: 0 },
  terrain: [],
  tracks: [],
  woodlands: [],
  shamblers: [],
});
const set = (template: ReturnType<typeof house>, [x, y, z]: Vec3, id: number) => {
  template.blocks[x + template.size[0] * (z + template.size[2] * y)] = id;
};
const planks = registry.blockIds.get('planks')!;
const hasIssue = (template: ReturnType<typeof house>, text: string) =>
  templateSpatialIssues(registry, template).some(([, message]) => message.includes(text));

describe('explicit storeys and ordinary-block flights on owned geometry', () => {
  it('admits the fixture with either ground storey', () => {
    expect(templateSpatialIssues(registry, house())).toEqual([]);
    expect(templateSpatialIssues(registry, compileTemplate(registry, definition()))).toEqual([]);
    expect(authoredLayoutIssues(layoutFixture(), registry)).toEqual([]);
  });
  it('rejects an upper-floor opening outside flight headroom under reachable floor space', () => {
    const template = house();
    set(template, [13, 8, 9], 0);
    expect(hasIssue(template, 'upper-storey floor opening')).toBe(true);
  });
  it('allows an upper-storey notch outside reachable standing floor space', () => {
    const template = house();
    set(template, [15, 8, 11], 0);
    expect(templateSpatialIssues(registry, template)).toEqual([]);
  });
  it('rejects a flight whose rise does not match its straight one-block treads', () => {
    const template = house();
    template.access!.stairs[0]!.upper[0] -= 1;
    expect(hasIssue(template, 'one-block rises')).toBe(true);
  });
  it.each([
    [1, 0, 3],
    [11, 8, 3],
  ] as Vec3[])('rejects missing landing support at [%i,%i,%i]', (x, y, z) => {
    const template = house();
    set(template, [x, y, z], 0);
    expect(hasIssue(template, 'supported landings')).toBe(true);
  });
  it('rejects headroom blocked at an intermediate tread even with clear endpoints', () => {
    const template = house();
    set(template, [6, 10, 3], planks);
    expect(hasIssue(template, 'headroom')).toBe(true);
  });
  it('preserves the fixture roof and rejects a ceiling inside standing clearance', () => {
    const template = house();
    expect(templateSpatialIssues(registry, template)).toEqual([]);
    expect(template.blocks[10 + 16 * (3 + 12 * 14)]).toBe(planks);
    for (let x = 1; x < 15; x++) {
      for (let z = 1; z < 11; z++) {
        set(template, [x, 12, z], planks);
      }
    }
    expect(hasIssue(template, 'headroom')).toBe(true);
  });
  it('rejects an entrance disconnected from the outside by a sealed doorway', () => {
    const template = house();
    for (let y = 1; y <= 4; y++) {
      for (const x of [2, 3]) {
        set(template, [x, y, 0], planks);
      }
    }
    expect(hasIssue(template, 'footprint edge')).toBe(true);
  });
  it('rejects upstairs floor space isolated behind a non-openable wall', () => {
    const template = house();
    for (let y = 9; y < 14; y++) {
      for (let x = 1; x < 15; x++) {
        set(template, [x, y, 7], planks);
      }
    }
    expect(hasIssue(template, 'unreachable')).toBe(true);
  });
  it('does not invent a physical blocker for passable furniture at the entrance', () => {
    const furniture = new Map(registry.furniture);
    furniture.set('crate', { ...furniture.get('crate')!, solid: false });
    const template = house();
    const pieces = [
      ...template.pieces,
      { furniture: 'crate', facing: 'n' as const, pos: [2, 1, 1] as Vec3, size: [2, 2, 2] as Vec3 },
    ];
    expect(templateSpatialIssues({ ...registry, furniture }, { ...template, pieces })).toEqual([]);
  });
  it('rejects an entrance without standing-body clearance rather than moving it sideways', () => {
    const template = house();
    template.access!.entrance = [2.5, 1, 2];
    set(template, [1, 2, 1], planks);
    expect(templateSpatialIssues(registry, template).some(([path]) => path === '.access.entrance')).toBe(true);
  });
  it('rejects a missing ground-storey id rather than moving the cellar origin', () => {
    const template = house();
    template.access!.ground = 'missing';
    expect(hasIssue(template, 'unique ids/heights')).toBe(true);
  });
  it('rejects stress-test repetition of explicitly planned storeys', () => {
    const layout = layoutFixture();
    layout.buildings[0]!.storeys = 2;
    expect(
      authoredLayoutIssues(layout, registry).some(([, message]) => message.includes('cannot be stress-test stacked')),
    ).toBe(true);
  });
  it('rejects a cellar whose lowest layer is below the world floor', () => {
    const layout = layoutFixture();
    layout.buildings[0]!.position[1] = -47;
    expect(
      authoredLayoutIssues(layout, registry).some(([, message]) => message.includes('below the world floor')),
    ).toBe(true);
  });
  it('walks both ways using player step physics without jumps or noclip', () => {
    const template = house();
    const solid = (x: number, y: number, z: number) => (template.blocks[x + 16 * (z + 12 * y)] ?? 0) !== 0;
    const scale = makeScale(0.5);
    const body = createPlayerBody(scale, 2, 1 + CONTACT_SKIN, 4);
    body.onGround = true;
    for (let tick = 0; tick < 150; tick++) {
      body.vel[0] = 3.6;
      stepBody(body, 1 / 60, solid, physicsFor(scale));
    }
    expect(body.pos[0]).toBeCloseTo(11, 3);
    expect(body.pos[1]).toBeCloseTo(9, 3);
    for (let tick = 0; tick < 150; tick++) {
      body.vel[0] = -3.6;
      stepBody(body, 1 / 60, solid, physicsFor(scale));
    }
    for (let tick = 0; tick < 20; tick++) {
      body.vel[0] = 0;
      stepBody(body, 1 / 60, solid, physicsFor(scale));
    }
    expect(body.pos[0]).toBeCloseTo(2, 3);
    expect(body.pos[1]).toBeCloseTo(1, 3);
  });
  it.each([0, 1, 2, 3] as const)('carves and restamps the cellar across chunk seams at turn %i', (turn: Turn) => {
    const scale = makeScale(0.5);
    const layout = layoutFixture();
    layout.buildings[0]!.rotation = (turn * 90) as 0 | 90 | 180 | 270;
    const site = new AuthoredSite(1, registry, scale, layout);
    const placement = site.placements[0]!;
    expect(placement.origin[1]).toBe(26);
    const world = new World();
    const terrain = {
      seed: 1,
      shape: terrainShapeOf(registry),
      scale,
      blocks: {
        grass: registry.blockIds.get('grass')!,
        dirt: registry.blockIds.get('dirt')!,
        rock: registry.blockIds.get('stone')!,
        sand: registry.blockIds.get('sand')!,
        water: registry.blockIds.get('water')!,
      },
      surface: site.surface,
      stamp: (chunk: Parameters<typeof site.stamp>[0]) => site.stamp(chunk),
    };
    const points = (
      [
        [1.5, 1, 1.5],
        [13.5, 1, 1.5],
        [1.5, 1, 9.5],
        [13.5, 1, 9.5],
      ] as Vec3[]
    ).map((point) => placedPoint(placement, point).map(Math.floor) as Vec3);
    expect(new Set(points.map(([x, , z]) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`)).size).toBe(4);
    const columns = [Math.floor(placement.origin[0] / CHUNK), Math.floor(placement.origin[2] / CHUNK)];
    for (let cx = columns[0]!; cx <= columns[0]! + 1; cx++) {
      for (let cz = columns[1]!; cz <= columns[1]! + 1; cz++) {
        for (const chunk of generateColumn(terrain, cx, cz)) {
          world.addChunk(chunk);
        }
      }
    }
    for (const point of points) {
      expect(world.getBlock(...point)).toBe(0);
      expect(world.getBlock(point[0], point[1] - 1, point[2])).toBe(planks);
      world.setBlock(...point, terrain.blocks.rock);
    }
    for (const chunk of world.chunks.values()) {
      site.stamp(chunk);
    }
    for (const point of points) {
      expect(world.getBlock(...point)).toBe(0);
    }
  });
});
