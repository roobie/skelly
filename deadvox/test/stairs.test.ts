import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authoredLayoutIssues } from '../src/core/authoredLayout.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { CONTACT_SKIN, stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import type { TemplateDef } from '../src/core/schema.ts';
import { templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate, placedFlights, placedPoint, type Turn } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { createPlayerBody, physicsFor } from '../src/game/player.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const { registry, issues } = buildRegistry(sources);
const house = () => compileTemplate(registry, registry.templates.get('stairs_house')!);
const set = (template: ReturnType<typeof house>, [x, y, z]: Vec3, id: number) => {
  template.blocks[x + template.size[0] * (z + template.size[2] * y)] = id;
};
const planks = registry.blockIds.get('planks')!;
const stampedLanding = (world: World, endpoint: Vec3) =>
  [-0.5, 0.5].flatMap((dx) =>
    [-0.5, 0.5].map((dz) => {
      const [x, z] = [Math.floor(endpoint[0] + dx), Math.floor(endpoint[2] + dz)];
      return [world.getBlock(x, endpoint[1], z), world.getBlock(x, endpoint[1] - 1, z)];
    }),
  );

describe('explicit storeys and ordinary-block flights', () => {
  it('admits both authorable examples including the openable bedroom door', () => {
    expect(issues).toEqual([]);
    expect(house().pieces.some((piece) => piece.furniture === 'wood_door')).toBe(true);
  });
  it("rejects an upper-floor opening outside every flight's footprint and headroom", () => {
    const template = house();
    const floorLayer = template.access!.stairs[0]!.upper[1] - 1;
    set(template, [0, floorLayer, 0], 0);
    expect(
      templateSpatialIssues(registry, template).some(([, message]) => message.includes('upper-storey floor opening')),
    ).toBe(true);
  });
  it('rejects a flight whose rise does not match its straight one-block treads', () => {
    const template = house();
    const access = structuredClone(template.access!);
    access.stairs[0]!.upper[0] -= 1;
    expect(
      templateSpatialIssues(registry, { ...template, access }).some(([, message]) =>
        message.includes('one-block rises'),
      ),
    ).toBe(true);
  });
  it.each([
    [1, 0, 4],
    [11, 8, 4],
  ] as Vec3[])('rejects a missing landing support cell at [%i,%i,%i]', (x, y, z) => {
    const template = house();
    set(template, [x, y, z], 0);
    expect(
      templateSpatialIssues(registry, template).some(([, message]) => message.includes('supported landings')),
    ).toBe(true);
  });
  it('rejects headroom blocked at an intermediate tread even when the endpoints are clear', () => {
    const template = house();
    set(template, [6, 10, 4], planks);
    expect(templateSpatialIssues(registry, template).some(([, message]) => message.includes('headroom'))).toBe(true);
  });
  it('preserves an authored 2.5 m room roof and rejects a ceiling inside standing clearance', () => {
    const authored = structuredClone(registry.templates.get('stairs_house')!) as TemplateDef;
    authored.id = 'authored_ceiling';
    authored.layers.splice(13, 1);
    authored.size = [16, 15, 16];
    const admit = () => buildRegistry([...sources, { source: 'ceiling.json', data: { templates: [authored] } }]);
    const ordinary = admit();
    expect(ordinary.issues).toEqual([]);
    const compiled = compileTemplate(ordinary.registry, ordinary.registry.templates.get(authored.id)!);
    for (const x of [10, 11]) {
      for (const z of [4, 5]) {
        expect(compiled.blocks[x + 16 * (z + 16 * 14)]).toBe(planks);
      }
    }
    authored.layers.splice(11, 2);
    authored.size = [16, 13, 16];
    expect(
      admit()
        .issues.filter((issue) => issue.path.includes('access.stairs'))
        .map((issue) => issue.message),
    ).toContain('flight needs standing and step-up headroom; blocked cell [8,12,4]');
  });
  it('rejects an entrance disconnected from the outside when the doorway is walled up', () => {
    const authored = structuredClone(registry.templates.get('stairs_house')!) as TemplateDef;
    authored.id = 'sealed_entrance';
    for (const y of [1, 2, 3, 4]) {
      authored.layers[y]![0] = 'wwwwwwwwwwwwwwww';
    }
    const result = buildRegistry([...sources, { source: 'sealed.json', data: { templates: [authored] } }]);
    expect(result.issues.some((issue) => issue.path.includes('access.entrance'))).toBe(true);
  });
  it('rejects upstairs floor space isolated behind a non-openable wall', () => {
    const template = house();
    for (let y = 9; y < 13; y++) {
      for (const x of [6, 7]) {
        set(template, [x, y, 9], planks);
      }
    }
    expect(templateSpatialIssues(registry, template).some(([, message]) => message.includes('unreachable'))).toBe(true);
  });
  it('does not invent a physical blocker for passable furniture at the entrance', () => {
    const furniture = new Map(registry.furniture);
    furniture.set('crate', { ...furniture.get('crate')!, solid: false });
    const template = house();
    const pieces = [
      ...template.pieces,
      { furniture: 'crate', facing: 'n' as const, pos: [1, 1, 1] as Vec3, size: [2, 2, 2] as Vec3 },
    ];
    expect(templateSpatialIssues({ ...registry, furniture }, { ...template, pieces })).toEqual([]);
  });
  it('rejects an entrance without standing-body clearance', () => {
    const template = house();
    // The body clips this cell at the half-grid entrance, but could stand a half-step east.
    // Reachability alone must not silently move an invalid spawn out of its obstruction.
    template.access!.entrance = [2.5, 1, 2];
    set(template, [1, 2, 1], planks);
    expect(templateSpatialIssues(registry, template).some(([path]) => path === '.access.entrance')).toBe(true);
  });
  it('rejects a missing ground-floor id rather than silently moving the cellar origin', () => {
    const template = house();
    expect(
      templateSpatialIssues(registry, { ...template, access: { ...template.access!, ground: 'missing' } }).some(
        ([, message]) => message.includes('unique ids/heights'),
      ),
    ).toBe(true);
  });
  it('rejects stress-test repetition of an explicitly planned building', () => {
    const layout = structuredClone(registry.layouts.get('stair_demo')!);
    layout.buildings[0]!.storeys = 2;
    expect(
      authoredLayoutIssues(layout, registry).some(([, message]) => message.includes('cannot be stress-test stacked')),
    ).toBe(true);
  });
  it('rejects a cellar whose lowest layer is below the world floor', () => {
    const layout = structuredClone(registry.layouts.get('stair_demo')!);
    layout.buildings[1]!.position[1] = -47;
    expect(
      authoredLayoutIssues(layout, registry).some(([, message]) => message.includes('below the world floor')),
    ).toBe(true);
  });
  it('walks both ways using actual player step physics without jumps or noclip', () => {
    const template = house();
    const solid = (x: number, y: number, z: number) => (template.blocks[x + 16 * (z + 16 * y)] ?? 0) !== 0;
    const scale = makeScale(0.5);
    const body = createPlayerBody(scale, 2, 1 + CONTACT_SKIN, 5);
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
  it.each([0, 1, 2, 3] as const)(
    'carves and restamps the cellar across chunk seams at turn %i with rotated landing data',
    (turn: Turn) => {
      const scale = makeScale(0.5);
      const layout = structuredClone(registry.layouts.get('stair_demo')!);
      layout.buildings = [
        { template: 'stairs_cabin', position: [59.5, 17, 59.5], rotation: (turn * 90) as 0 | 90 | 180 | 270 },
      ];
      const site = new AuthoredSite(1, registry, scale, layout);
      const placement = site.placements[0]!;
      expect(placement.origin[1]).toBe(26);
      const world = new World();
      const terrain = {
        seed: 1,
        scale,
        blocks: {
          grass: registry.blockIds.get('grass')!,
          dirt: registry.blockIds.get('dirt')!,
          stone: registry.blockIds.get('stone')!,
          sand: registry.blockIds.get('sand')!,
        },
        surface: site.surface,
        stamp: (chunk: Parameters<typeof site.stamp>[0]) => site.stamp(chunk),
      };
      const point = placedPoint(placement, [11, 1, 11]);
      const columns = [Math.floor(placement.origin[0] / CHUNK), Math.floor(placement.origin[2] / CHUNK)];
      for (let cx = columns[0]!; cx <= columns[0]! + 1; cx++) {
        for (let cz = columns[1]!; cz <= columns[1]! + 1; cz++) {
          for (const chunk of generateColumn(terrain, cx, cz)) {
            world.addChunk(chunk);
          }
        }
      }
      expect(world.getBlock(...(point.map(Math.floor) as Vec3))).toBe(0);
      expect(world.getBlock(Math.floor(point[0]), point[1] - 1, Math.floor(point[2]))).toBe(
        registry.blockIds.get('stone'),
      );
      const [flight] = placedFlights(placement);
      expect(flight).toMatchObject({ from: 'cellar', to: 'ground' });
      for (const endpoint of [flight!.lower, flight!.upper]) {
        expect(stampedLanding(world, endpoint)).toEqual(Array.from({ length: 4 }, () => [0, planks]));
      }
      const delta = flight!.upper.map((value, axis) => Math.abs(value - flight!.lower[axis]!));
      expect(delta[1]).toBe(8);
      expect(delta[0]! + delta[2]!).toBe(9);
      for (const chunk of world.chunks.values()) {
        site.stamp(chunk);
      }
      expect(world.getBlock(...(point.map(Math.floor) as Vec3))).toBe(0);
    },
  );
});
