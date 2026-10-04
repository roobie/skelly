// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared rejection assertions called only by tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildingBounds } from '../src/core/authoredLayout.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { configFromUrl } from '../src/game/config.ts';

const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
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
  expect(result.registry.layouts.size).toBe(0); // Whole-file rejection, not partially stamped content.
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
