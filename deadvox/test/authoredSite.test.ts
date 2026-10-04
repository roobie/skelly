// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared rejection assertions called only by tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildingBounds, defaultFoundation, profileHeight, standingHeight } from '../src/core/authoredTerrain.mjs';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { configFromUrl } from '../src/game/config.ts';

const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && file !== 'layouts.json')
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const layout = (JSON.parse(readFileSync('src/content/base/layouts.json', 'utf8')) as { layouts: SiteLayoutDef[] })
  .layouts[0]!;
const load = (data: unknown) => buildRegistry([...base, { source: 'layout-test.json', data: { layouts: [data] } }]);
const { registry, issues } = load(layout);
const scale = makeScale(0.5);
const invalid = (data: unknown, message: string) => {
  const result = load(data);
  expect(result.issues.some((issue) => issue.source === 'layout-test.json' && issue.message.includes(message))).toBe(
    true,
  );
  expect([...result.registry.layouts.keys()]).toEqual([...buildRegistry(base).registry.layouts.keys()]); // No rejected file's layouts, while unrelated bundled sites survive.
};

describe('authored layout acceptance', () => {
  it('accepts the exported beat-1 map and selects its bundled id from the URL', () => {
    expect(issues).toEqual([]);
    expect(configFromUrl(new URLSearchParams('site=lone_house&debug=1')).site).toBe('lone_house');
    expect(buildingBounds(layout.buildings[1]!, registry.templates.get('shed')!.size)).toEqual({
      x0: 49,
      z0: 57,
      x1: 52,
      z1: 61,
    });
  });
  it('rejects floating foundations and buried interior cells even when footprint corners fit', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[0], position: [55, 23, 55] }] }, 'foundation cut or fill');
    invalid(
      { ...layout, terrain: [{ kind: 'hill', centre: [60, 58.5], radii: [1, 1], rise: 2 }] },
      'foundation cut or fill',
    );
  });
  it('rejects floating terrain spawns and unsupported or buried building spawns', () => {
    invalid({ ...layout, player: { ...layout.player, position: [72, 22.5, 65] } }, 'supported surface');
    invalid({ ...layout, shamblers: [{ ...layout.shamblers[0], position: [58, 25.5, 59.5] }] }, 'supported surface');
    invalid({ ...layout, player: { ...layout.player, position: [55, 21.5, 55] } }, 'supported surface');
  });
  it('rejects ridge primitives with zero width or no non-zero segment', () => {
    const ridge = {
      kind: 'ridge',
      points: [
        [2, 2],
        [4, 2],
      ],
      rise: 1,
      width: 1,
    };
    expect(load({ ...layout, terrain: [ridge] }).issues).toEqual([]);
    invalid({ ...layout, terrain: [{ ...ridge, width: 0 }] }, 'Invalid value');
    invalid(
      {
        ...layout,
        terrain: [
          {
            ...ridge,
            points: [
              [2, 2],
              [2, 2],
            ],
          },
        ],
      },
      'non-zero segment',
    );
  });
  it('rejects hill primitives with non-positive radius or rise', () => {
    const hill = { kind: 'hill', centre: [2, 2], radii: [1, 1], rise: 1 };
    expect(load({ ...layout, terrain: [hill] }).issues).toEqual([]);
    invalid({ ...layout, terrain: [{ ...hill, radii: [0, 1] }] }, 'Invalid value');
    invalid({ ...layout, terrain: [{ ...hill, rise: -1 }] }, 'Invalid value');
  });
  it('rejects an unknown building template', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[0], template: 'missing' }] }, 'no template');
  });
  it('rejects an unknown shambler type', () => {
    invalid({ ...layout, shamblers: [{ ...layout.shamblers[0], type: 'missing' }] }, 'no zombie type');
  });
  it('rejects a building whose rotated depth leaves the bounds', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[1], position: [0, 21, 125] }] }, 'outside site bounds');
  });
  it('rejects a player spawn on the exclusive upper boundary', () => {
    invalid({ ...layout, player: { ...layout.player, position: [128, 21.5, 65] } }, 'outside site bounds');
  });
  it('rejects an out-of-bounds shambler even when its chance is zero', () => {
    invalid(
      { ...layout, shamblers: [{ ...layout.shamblers[0], position: [129, 25, 60], chance: 0 }] },
      'outside site bounds',
    );
  });
  it('rejects a woodland vertex outside the bounds', () => {
    invalid(
      {
        ...layout,
        woodlands: [
          {
            polygon: [
              [0, 0],
              [129, 0],
              [0, 10],
            ],
            density: 1,
          },
        ],
      },
      'outside site bounds',
    );
  });
  it('checks the track width, not only its centreline, against bounds', () => {
    invalid(
      {
        ...layout,
        tracks: [
          {
            points: [
              [127, 10],
              [127, 20],
            ],
            width: 4,
          },
        ],
      },
      'outside site bounds',
    );
  });
  it('rejects overlapping rotated building footprints', () => {
    invalid(
      { ...layout, buildings: [layout.buildings[0], { ...layout.buildings[1], position: [54, 21, 56] }] },
      'overlaps buildings[0]',
    );
  });
  it('rejects building positions between half-metre blocks', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[0], position: [55.25, 21, 55] }] }, 'snapped to 0.5 m');
  });
  it('rejects a non-quarter-turn building rotation', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[0], rotation: 45 }] }, 'quarter turn');
  });
  it('rejects woodland density outside 0..1', () => {
    invalid({ ...layout, woodlands: [{ ...layout.woodlands[0], density: 1.1 }] }, 'must be 0 to 1');
  });
  it('rejects shambler chance outside 0..1', () => {
    invalid({ ...layout, shamblers: [{ ...layout.shamblers[0], chance: 1.1 }] }, 'must be 0 to 1');
  });
  it('rejects a zero-width track', () => {
    invalid({ ...layout, tracks: [{ ...layout.tracks[0], width: 0 }] }, 'Invalid value');
  });
  it('rejects bounds without positive area', () => {
    invalid({ ...layout, bounds: { ...layout.bounds, x1: 0 } }, 'positive area');
  });
  it('rejects a foundation elevation between block layers', () => {
    invalid({ ...layout, ground: 21.25 }, 'snapped to 0.5 m');
  });
  it('rejects a layout that shadows a built-in site', () => {
    invalid({ ...layout, id: 'hamlet' }, 'reserved built-in site id');
  });
});

it('grounds the exported ridge lots, track and slope trees with order-independent overlapping profiles', () => {
  const ridge = (
    JSON.parse(readFileSync('src/content/base/hunting-cabins.json', 'utf8')) as { layouts: SiteLayoutDef[] }
  ).layouts[0]!;
  expect(buildRegistry(base).issues).toEqual([]);
  expect(ridge.buildings.map((building) => building.position[1])).toEqual([31, 31, 30.5]);
  expect(ridge.player.position).toEqual([64, 21.5, 20]);
  for (const building of ridge.buildings) {
    expect(building.position[1]).toBe(
      defaultFoundation(ridge, buildingBounds(building, registry.templates.get(building.template)!.size)),
    );
  }
  const site = new AuthoredSite(73, registry, scale, ridge);
  const reversed = new AuthoredSite(73, registry, scale, {
    ...ridge,
    terrain: [...ridge.terrain].reverse(),
    buildings: [...ridge.buildings].reverse(),
  });
  expect(profileHeight(ridge, 64, 90)).toBe(31);
  expect(
    profileHeight(
      { ...ridge, terrain: [ridge.terrain[0]!, { kind: 'hill', centre: [64, 90], radii: [10, 10], rise: 3 }] },
      64,
      90,
    ),
  ).toBe(31); // overlaps take max, not summed heights
  expect(profileHeight(ridge, 64, 20)).toBe(21);
  expect(site.surface.height(128, 160, 42)).toBeGreaterThan(site.surface.height(128, 80, 42));
  expect(site.surface.top(128, 160)).toBe(registry.blockIds.get('dirt'));
  expect(Math.abs(site.surface.height(84, 180, 42) * scale.blockSize - 31)).toBeLessThanOrEqual(0.5); // 3 m outside cabin 1: blend toward the ridge, not flat ground21.
  expect(standingHeight(ridge, [], 64, 20)).toBe(ridge.player.position[1]);
  expect(site.trees.length).toBeGreaterThan(0);
  expect(new Set(site.trees.map((t) => t.origin[1])).size).toBeGreaterThan(1);
  for (const tree of site.trees) {
    const [x, y, z] = tree.origin;
    expect(y).toBe(site.surface.height(x, z, 42) + 1);
  }
  const columns: [number, number][] = [
    [3, 4],
    [4, 4],
    [3, 5],
    [4, 5],
  ];
  const generate = (owner: AuthoredSite, order: [number, number][]) => {
    const world = new World();
    for (const [cx, cz] of order) {
      for (const chunk of generateColumn(
        {
          seed: 73,
          scale,
          blocks: {
            grass: registry.blockIds.get('grass')!,
            dirt: registry.blockIds.get('dirt')!,
            stone: registry.blockIds.get('stone')!,
            sand: registry.blockIds.get('sand')!,
          },
          surface: owner.surface,
          stamp: (written) => owner.stamp(written),
        },
        cx,
        cz,
      )) {
        world.addChunk(chunk);
      }
    }
    return world;
  };
  const a = generate(site, columns);
  const b = generate(reversed, [...columns].reverse());
  for (const [key, chunk] of a.chunks) {
    expect(Buffer.from(chunk.toArray().buffer).equals(Buffer.from(b.chunks.get(key)!.toArray().buffer)), key).toBe(
      true,
    );
  }
});

it('grounds a seed-owned woodland tree in the lot blend rather than on the raw ridge', () => {
  const ridge = structuredClone(registry.layouts.get('hunting_cabins')!);
  const fixture: SiteLayoutDef = {
    ...ridge,
    id: 'ridge_tree_blend',
    buildings: [{ template: 'shed', position: [62.5, 30, 82], rotation: 90 }],
    tracks: [],
    woodlands: [
      {
        polygon: [
          [62, 77],
          [75, 77],
          [75, 93],
          [62, 93],
        ],
        density: 1,
      },
    ],
  };
  expect(load(fixture).issues).toEqual([]);
  const site = new AuthoredSite(73, registry, scale, fixture);
  // One young tree, canopy just outside the reserved apron. Its feet are31m on
  // the blend; raw ridge grounding would put them at31.5m (63 blocks).
  expect(site.trees.map((tree) => tree.origin)).toEqual([[138, 62, 169]]);
  expect(site.surface.height(138, 169, 42)).toBe(61);
});

it('keeps adjacent different-elevation lots and their aprons independent of building order', () => {
  const lowered = structuredClone(layout);
  lowered.buildings[1]!.position[1] = 19;
  for (const buildings of [lowered.buildings, [...lowered.buildings].reverse()]) {
    const site = new AuthoredSite(1, registry, scale, { ...lowered, buildings });
    expect(site.surface.height(100, 118, 42)).toBe(38); // shed footprint
    expect(site.surface.height(104, 118, 42)).toBe(38); // shed apron beside the house blend
    expect(site.surface.height(120, 118, 42)).toBe(42); // house footprint
    expect(site.surface.height(106.5, 118, 42)).toBe(38); // equal footprint distances: stable shed key
    const world = new World();
    for (const chunk of generateColumn(
      {
        seed: 1,
        scale,
        blocks: {
          grass: registry.blockIds.get('grass')!,
          dirt: registry.blockIds.get('dirt')!,
          stone: registry.blockIds.get('stone')!,
          sand: registry.blockIds.get('sand')!,
        },
        surface: site.surface,
        stamp: (written) => site.stamp(written),
      },
      3,
      3,
    )) {
      world.addChunk(chunk);
    }
    expect([39, 40, 41, 42].map((y) => world.getBlock(104, y, 118))).toEqual([0, 0, 0, 0]);
  }
});

it('stamps the rotated two-storey house deterministically across columns, with upstairs furniture and spawns', () => {
  const site = new AuthoredSite(1, registry, scale, layout);
  expect(site.placements[0]!.origin).toEqual([110, 42, 110]);
  const columns: [number, number][] = [
    [3, 3],
    [4, 3],
    [4, 4],
    [3, 2],
  ];
  const generate = (order: [number, number][]) => {
    const world = new World();
    for (const [cx, cz] of order) {
      for (const chunk of generateColumn(
        {
          seed: 1,
          scale,
          blocks: {
            grass: registry.blockIds.get('grass')!,
            dirt: registry.blockIds.get('dirt')!,
            stone: registry.blockIds.get('stone')!,
            sand: registry.blockIds.get('sand')!,
          },
          surface: site.surface,
          stamp: (written) => site.stamp(written),
        },
        cx,
        cz,
      )) {
        world.addChunk(chunk);
      }
    }
    return world;
  };
  const a = generate(columns);
  const b = generate([...columns].reverse());
  for (const [key, chunk] of a.chunks) {
    expect(Buffer.from(chunk.toArray().buffer).equals(Buffer.from(b.chunks.get(key)!.toArray().buffer)), key).toBe(
      true,
    );
  }
  const [spawn] = site.zombiesIn(3, 3).filter((zombie) => zombie.pos[1] === 50);
  expect(spawn?.pos).toEqual([116, 50, 119]);
  expect(registry.blocks[a.getBlock(116, 49, 119)!]!.solid).toBe(true);
  expect(a.getBlock(116, 50, 119)).toBe(0);
  expect(site.furnitureIn(3, 3).some(({ spec }) => spec.type === 'bed' && spec.pos[1] === 50)).toBe(true);
  expect(site.trees.length).toBeGreaterThan(0);
  expect(site.surface.top(144, 130)).toBe(registry.blockIds.get('dirt'));
  const optional = new AuthoredSite(1, registry, scale, {
    ...layout,
    shamblers: [{ ...layout.shamblers[0]!, chance: 0 }],
  });
  expect(optional.zombiesIn(3, 3).some((zombie) => zombie.pos[1] === 50)).toBe(false);
});
