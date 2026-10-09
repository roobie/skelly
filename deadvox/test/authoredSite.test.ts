// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared rejection assertions called only by tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authoredLayoutIssues, inPolygon } from '../src/core/authoredLayout.ts';
import { placementOf } from '../src/core/authoredPlacement.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import {
  buildingBounds,
  defaultFoundation,
  LOT_APRON_M,
  LOT_BLEND_M,
  layoutHeight,
  lotOf,
  polylineDistance,
  profileHeight,
  rectDistance,
  standingHeight,
} from '../src/core/authoredTerrain.mjs';
import { SPAWN_TIMES } from '../src/core/clock.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { compassBearing, toChunk } from '../src/core/coords.ts';
import { militaryLootItems } from '../src/core/magazine.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, TemplateDef } from '../src/core/schema.ts';
import { zombieBodyDimensions } from '../src/core/spawnClearance.ts';
import { templateSpawnClearanceIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate, footprint, placedSpawns } from '../src/core/templates.ts';
import { rectsOverlap } from '../src/core/vegetation.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { configFromUrl } from '../src/game/config.ts';

const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const layout = (JSON.parse(readFileSync('src/content/base/layouts.json', 'utf8')) as { layouts: SiteLayoutDef[] })
  .layouts[0]!;
const load = (data: unknown) => buildRegistry([...base, { source: 'layout-test.json', data: { layouts: [data] } }]);
const { registry, issues } = load(layout);
const baseLayoutIds = [...registry.layouts.keys()].filter((id) => id !== layout.id);
const validationLayout = (id: string): SiteLayoutDef => ({
  id,
  bounds: { x0: 0, z0: 0, x1: 10, z1: 10 },
  ground: 0,
  terrain: [],
  buildings: [],
  player: { position: [5, 0.5, 5], bearing: 0 },
  shamblers: [],
  woodlands: [],
  tracks: [],
});
const layoutTemplateIds = new Set(layout.buildings.map(({ template }) => template));
const layoutZombieIds = new Set(layout.shamblers.map(({ type }) => type));
const layoutValidationBase = [
  {
    source: 'layout-validation-support.json',
    data: {
      templates: [...layoutTemplateIds].map((id) => {
        const [width, height, depth] = registry.templates.get(id)!.size;
        return {
          id,
          size: [width, height, depth],
          palette: { '.': 'air' },
          layers: Array.from({ length: height }, () => Array.from({ length: depth }, () => '.'.repeat(width))),
        };
      }),
      zombies: [...layoutZombieIds].map((id) => {
        const zombie = structuredClone(registry.zombies.get(id)!);
        zombie.loot = undefined;
        return zombie;
      }),
      // The zombies name the tool quality that dismembers them, so one tool has to have it.
      items: [
        {
          id: 'layout_blade',
          name: 'Blade',
          category: 'tool',
          weight: 1,
          size: [1, 1],
          tool: {
            qualities: Object.fromEntries(
              [...layoutZombieIds].flatMap((id) => {
                const dismember = registry.zombies.get(id)!.downed?.dismember;
                return dismember ? [[dismember.quality, dismember.level]] : [];
              }),
            ),
          },
        },
      ],
      sounds: [...new Set([...layoutZombieIds].flatMap((id) => Object.values(registry.zombies.get(id)!.sounds)))].map(
        (id) => structuredClone(registry.sounds.get(id)!),
      ),
      layouts: baseLayoutIds.map(validationLayout),
    },
  },
];
const scale = makeScale(0.5);
interface AuthoredTerrainCase {
  site: AuthoredSite;
  sourceLayout: SiteLayoutDef;
  lots: ReturnType<typeof lotOf>[];
  natural: number;
}
const authoredSiteHeight = ({ sourceLayout, lots, natural }: AuthoredTerrainCase, x: number, z: number): number =>
  Math.round(
    layoutHeight(
      sourceLayout,
      lots,
      [(x + 0.5) * scale.blockSize, (z + 0.5) * scale.blockSize],
      natural * scale.blockSize,
    ) / scale.blockSize,
  );
const expectAuthoredSiteHeight = (terrain: AuthoredTerrainCase, x: number, z: number): void =>
  expect(terrain.site.surface.height(x, z, terrain.natural)).toBe(authoredSiteHeight(terrain, x, z));
const expectBuildingApronsUnnoised = (terrain: AuthoredTerrainCase): void => {
  let checked = 0;
  for (const building of terrain.sourceLayout.buildings) {
    const bounds = buildingBounds(building, registry.templates.get(building.template)!.size);
    for (
      let x = Math.floor((bounds.x0 - LOT_APRON_M) / scale.blockSize);
      x < Math.ceil((bounds.x1 + LOT_APRON_M) / scale.blockSize);
      x++
    ) {
      for (
        let z = Math.floor((bounds.z0 - LOT_APRON_M) / scale.blockSize);
        z < Math.ceil((bounds.z1 + LOT_APRON_M) / scale.blockSize);
        z++
      ) {
        const centreX = (x + 0.5) * scale.blockSize;
        const centreZ = (z + 0.5) * scale.blockSize;
        if (rectDistance(bounds, centreX, centreZ, scale.blockSize) <= LOT_APRON_M) {
          expectAuthoredSiteHeight(terrain, x, z);
          checked += 1;
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
};
const expectTracksUnnoised = (terrain: AuthoredTerrainCase): void => {
  let checked = 0;
  for (const track of terrain.sourceLayout.tracks) {
    const halfWidth = track.width / 2;
    const xs = track.points.map(([x]) => x);
    const zs = track.points.map(([, z]) => z);
    for (
      let x = Math.floor((Math.min(...xs) - halfWidth) / scale.blockSize);
      x < Math.ceil((Math.max(...xs) + halfWidth) / scale.blockSize);
      x++
    ) {
      for (
        let z = Math.floor((Math.min(...zs) - halfWidth) / scale.blockSize);
        z < Math.ceil((Math.max(...zs) + halfWidth) / scale.blockSize);
        z++
      ) {
        const centre: [number, number] = [(x + 0.5) * scale.blockSize, (z + 0.5) * scale.blockSize];
        if (polylineDistance(centre, track.points) <= halfWidth) {
          expectAuthoredSiteHeight(terrain, x, z);
          checked += 1;
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
};
const expectSpawnMarginsUnnoised = (terrain: AuthoredTerrainCase): void => {
  const spawnClearanceRadiusMetres = 2;
  const spawnPoints = [
    [terrain.sourceLayout.player.position[0], terrain.sourceLayout.player.position[2]],
    ...terrain.sourceLayout.shamblers.map((spawn) => [spawn.position[0], spawn.position[2]]),
    ...terrain.site.placements
      .flatMap(placedSpawns)
      .map((marker) => [marker.pos[0] * scale.blockSize, marker.pos[2] * scale.blockSize]),
  ];
  let checked = 0;
  for (const [spawnX, spawnZ] of spawnPoints) {
    for (
      let x = Math.floor((spawnX! - spawnClearanceRadiusMetres) / scale.blockSize);
      x < Math.ceil((spawnX! + spawnClearanceRadiusMetres) / scale.blockSize);
      x++
    ) {
      for (
        let z = Math.floor((spawnZ! - spawnClearanceRadiusMetres) / scale.blockSize);
        z < Math.ceil((spawnZ! + spawnClearanceRadiusMetres) / scale.blockSize);
        z++
      ) {
        const centreX = (x + 0.5) * scale.blockSize;
        const centreZ = (z + 0.5) * scale.blockSize;
        if (Math.hypot(centreX - spawnX!, centreZ - spawnZ!) <= spawnClearanceRadiusMetres) {
          expectAuthoredSiteHeight(terrain, x, z);
          checked += 1;
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
};
const openGroundHasNoise = (terrain: AuthoredTerrainCase): boolean => {
  for (let x = Math.ceil(terrain.sourceLayout.bounds.x0 / 16) * 16; x < terrain.sourceLayout.bounds.x1; x += 16) {
    for (let z = Math.ceil(terrain.sourceLayout.bounds.z0 / 16) * 16; z < terrain.sourceLayout.bounds.z1; z += 16) {
      const cellX = Math.floor(x / scale.blockSize);
      const cellZ = Math.floor(z / scale.blockSize);
      if (terrain.site.surface.height(cellX, cellZ, terrain.natural) !== authoredSiteHeight(terrain, cellX, cellZ)) {
        return true;
      }
    }
  }
  return false;
};
const withClearTemplateSpawn = (
  contentRegistry: Registry,
  definition: TemplateDef,
  markerChar: string,
  air: string,
): TemplateDef | undefined => {
  for (const [index, layer] of definition.layers.slice(1).entries()) {
    const y = index + 1;
    for (const [z, row] of layer.entries()) {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== air) {
          continue;
        }
        const layers = definition.layers.map((rows) => [...rows]);
        layers[y]![z] = `${row.slice(0, x)}${markerChar}${row.slice(x + 1)}`;
        const candidate: TemplateDef = {
          ...definition,
          layers,
          palette: {
            ...definition.palette,
            [markerChar]: { spawn: 'shambler', window: { fromGameTimeOfDay: 'dusk' } },
          } as unknown as TemplateDef['palette'],
        };
        if (templateSpawnClearanceIssues(contentRegistry, compileTemplate(contentRegistry, candidate)).length === 0) {
          return candidate;
        }
      }
    }
  }
  return undefined;
};

const minimalLayoutBaselineIssues = buildRegistry([
  ...layoutValidationBase,
  { source: 'layout-test.json', data: { layouts: [layout] } },
]).issues.filter((issue) => issue.source === 'layout-test.json');
const invalid = (data: unknown, message: string) => {
  expect(minimalLayoutBaselineIssues.some((issue) => issue.message.includes(message))).toBe(false);
  const result = buildRegistry([...layoutValidationBase, { source: 'layout-test.json', data: { layouts: [data] } }]);
  expect(result.issues.some((issue) => issue.source === 'layout-test.json' && issue.message.includes(message))).toBe(
    true,
  );
  expect([...result.registry.layouts.keys()]).toEqual(baseLayoutIds); // No rejected fixture layouts; unrelated bundled sites survive.
};
const invalidWithSharedRegistry = (data: SiteLayoutDef, message: string) => {
  expect(authoredLayoutIssues(data, registry).some(([, issue]) => issue.includes(message))).toBe(true);
};
const fixedLootBuilding = layout.buildings[0]!;
const fixedLootTemplate = compileTemplate(registry, registry.templates.get(fixedLootBuilding.template)!);
const fixedLootContainer = fixedLootTemplate.pieces.find(
  (piece) => registry.furniture.get(piece.furniture)?.container,
)!;
const withFixedLoot = (at: [number, number, number], item: string) => ({
  ...layout,
  buildings: [{ ...fixedLootBuilding, fixedLoot: [{ at, items: [{ item }] }] }, ...layout.buildings.slice(1)],
});

const siteColumns = (site: AuthoredSite, fixture: SiteLayoutDef): [number, number][] => {
  const columns = new Map<string, [number, number]>();
  const addRange = (x0: number, x1: number, z0: number, z1: number) => {
    for (let cx = toChunk(x0); cx <= toChunk(x1); cx++) {
      for (let cz = toChunk(z0); cz <= toChunk(z1); cz++) {
        columns.set(`${cx},${cz}`, [cx, cz]);
      }
    }
  };
  for (const placement of site.placements) {
    const [width, depth] = footprint(placement);
    addRange(
      placement.origin[0],
      placement.origin[0] + width - 1,
      placement.origin[2],
      placement.origin[2] + depth - 1,
    );
  }
  for (const spawn of fixture.shamblers) {
    const x = Math.floor(spawn.position[0] / scale.blockSize);
    const z = Math.floor(spawn.position[2] / scale.blockSize);
    addRange(x, x, z, z);
  }
  return [...columns.values()];
};

const siteWorld = (site: AuthoredSite, columns: [number, number][], seed: number): World => {
  const world = new World();
  for (const [cx, cz] of columns) {
    for (const chunk of generateColumn(
      {
        seed,
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

describe('authored layout acceptance', () => {
  it('keeps the fixed camp amalgam clear of authored vehicle routes', () => {
    const playtest = JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as {
      layouts: SiteLayoutDef[];
    };
    const camp = playtest.layouts[0]!;
    const amalgams = camp.shamblers.filter(({ type }) => type === 'amalgam');
    expect(amalgams.length).toBeGreaterThan(0);
    const { blockSize } = makeScale(0.5);
    for (const marker of amalgams) {
      const body = zombieBodyDimensions(registry.zombies.get(marker.type)!, blockSize);
      const bodyRadius = Math.hypot(body.halfWidth, body.halfDepth ?? body.halfWidth) * blockSize;
      const nearestTrackEdge = Math.min(
        ...camp.tracks.map(
          (track) => polylineDistance([marker.position[0], marker.position[2]], track.points) - track.width / 2,
        ),
      );

      expect(nearestTrackEdge).toBeGreaterThan(bodyRadius);
    }
  });
  it('carries a spawn window from a template marker into its world column', () => {
    const templateSource = base.find((file) => file.source === 'templates.json')!;
    const templateFile = structuredClone(templateSource.data) as { templates: TemplateDef[] };
    const building = layout.buildings[0]!;
    const templateIndex = templateFile.templates.findIndex(({ id }) => id === building.template);
    const definition = templateFile.templates[templateIndex]!;
    const air = Object.entries(definition.palette).find(([, entry]) => entry === 'air')?.[0];
    expect(air).toBeDefined();
    const used = new Set(Object.keys(definition.palette));
    const markerChar = ['@', '$', '?', '!'].find((char) => !used.has(char));
    expect(markerChar).toBeDefined();
    const timedTemplate = withClearTemplateSpawn(registry, definition, markerChar!, air!);
    expect(timedTemplate).toBeDefined();
    templateFile.templates[templateIndex] = timedTemplate!;
    const files = base.map((file) =>
      file.source === templateSource.source ? { source: file.source, data: templateFile } : file,
    );
    const result = buildRegistry([...files, { source: 'layout-test.json', data: { layouts: [layout] } }]);
    expect(result.issues.filter((issue) => issue.source === 'layout-test.json')).toEqual([]);
    const admitted = result.registry.layouts.get(layout.id)!;
    const placement = placementOf(result.registry, admitted.buildings[0]!);
    const expected = placedSpawns(placement).find(({ window }) => window?.fromGameTimeOfDay === SPAWN_TIMES.dusk)!;
    expect(expected.window).toEqual({ fromGameTimeOfDay: SPAWN_TIMES.dusk });
    const site = new AuthoredSite(1, result.registry, scale, admitted);
    expect(site.zombiesIn(toChunk(expected.pos[0]), toChunk(expected.pos[2]))).toContainEqual({
      type: 'shambler',
      pos: expected.pos,
      window: { fromGameTimeOfDay: SPAWN_TIMES.dusk },
    });
  });
  it('carries a spawn window from an authored marker into its world column', () => {
    const marker = { ...layout.shamblers[0]!, chance: 1, window: { fromGameTimeOfDay: 'dusk' } };
    const timedLayout = { ...layout, shamblers: [marker] };
    const result = load(timedLayout);
    expect(result.issues.filter((issue) => issue.source === 'layout-test.json')).toEqual([]);
    const admitted = result.registry.layouts.get(layout.id)!;
    const site = new AuthoredSite(1, result.registry, scale, admitted);
    const x = marker.position[0] / scale.blockSize;
    const z = marker.position[2] / scale.blockSize;
    expect(site.zombiesIn(toChunk(x), toChunk(z))).toContainEqual({
      type: marker.type,
      pos: [x, marker.position[1] / scale.blockSize, z],
      window: { fromGameTimeOfDay: SPAWN_TIMES.dusk },
    });
  });

  it('accepts the exported beat-1 map and selects its bundled id from the URL', () => {
    expect(issues).toEqual([]);
    expect(configFromUrl(new URLSearchParams('site=lone_house&debug=1')).site).toBe('lone_house');
    const playtestLayout = BUNDLED_CONTENT.registry.layouts.get('playtest')!;
    expect(configFromUrl(new URLSearchParams('site=playtest')).site).toBe('playtest');
    expect(configFromUrl(new URLSearchParams('site=playtest')).start).toBe(playtestLayout.startTimeGameTimeOfDay);
    expect(configFromUrl(new URLSearchParams('site=playtest&time=18:30')).start).toBe(18.5 * 60 * 60);
  });
  it('maps a clockwise east bearing to an east-facing authored spawn', () => {
    const east = new AuthoredSite(1, registry, scale, {
      ...layout,
      player: { ...layout.player, bearing: 90 },
    });
    expect(compassBearing(east.spawn.yaw)).toBeCloseTo(90, 8);
  });
  it('rejects floating foundations and buried interior cells even when footprint corners fit', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[0], position: [55, 23, 55] }] }, 'foundation cut or fill');
    invalid(
      { ...layout, terrain: [{ kind: 'hill', centre: [60, 58.5], radii: [1, 1], rise: 2 }] },
      'foundation cut or fill',
    );
  });
  it('rejects a player spawn floating above its terrain floor', () => {
    invalidWithSharedRegistry(
      { ...layout, player: { ...layout.player, position: [72, 22.5, 65] } },
      'supported surface',
    );
  });
  it('rejects an amalgam whose feet are clear but whose full envelope intersects a building', () => {
    const template: TemplateDef = {
      id: 'spawn_clearance_fixture',
      size: [4, 4, 4],
      palette: { '.': 'air', '#': 'planks', z: { spawn: 'amalgam' } },
      layers: [
        ['####', '####', '####', '####'],
        ['....', '#.z.', '....', '....'],
        ['....', '....', '....', '....'],
        ['....', '....', '....', '....'],
      ],
    };
    const fixtureRegistry = {
      ...registry,
      templates: new Map(registry.templates).set(template.id, template),
    };
    const site = {
      ...validationLayout('spawn_clearance_fixture'),
      buildings: [{ template: template.id, position: [4, 0, 4] as [number, number, number], rotation: 0, storeys: 1 }],
      player: { position: [2, 0.5, 2], bearing: 0 },
      shamblers: [{ type: 'amalgam', position: [4.8, 0.5, 4.5], chance: 1 }],
    } as SiteLayoutDef;

    const amalgamIssues = authoredLayoutIssues(site, fixtureRegistry).map(([path]) => path);
    const smallZombieSite = {
      ...site,
      shamblers: [{ ...site.shamblers[0]!, type: 'shambler' }],
    };

    expect(authoredLayoutIssues(smallZombieSite, fixtureRegistry).map(([path]) => path)).not.toContain(
      '.shamblers[0].position',
    );
    expect(amalgamIssues).toContain('.shamblers[0].position');
  });
  it('rejects an elevated shambler spawn without support', () => {
    const supported = validationLayout('shambler_support_fixture');
    const unsupported = {
      ...supported,
      shamblers: [{ ...layout.shamblers[0]!, position: [5, 10.5, 5] as const }],
    };
    const accepted = buildRegistry([
      ...layoutValidationBase,
      { source: 'layout-test.json', data: { layouts: [supported] } },
    ]);
    expect(accepted.issues.filter((issue) => issue.source === 'layout-test.json')).toEqual([]);
    const rejected = buildRegistry([
      ...layoutValidationBase,
      { source: 'layout-test.json', data: { layouts: [unsupported] } },
    ]);
    expect(
      rejected.issues.some(
        (issue) => issue.source === 'layout-test.json' && issue.message.includes('supported surface'),
      ),
    ).toBe(true);
    expect([...rejected.registry.layouts.keys()]).toEqual(baseLayoutIds);
  });
  it('rejects a player spawn on an unsupported building cell', () => {
    invalidWithSharedRegistry(
      { ...layout, player: { ...layout.player, position: [55, 21.5, 55] } },
      'supported surface',
    );
  });
  it('has no baseline layout issues for the fields covered by the minimal registry', () => {
    const supportedIssues = minimalLayoutBaselineIssues.filter((issue) => !issue.message.includes('supported surface'));
    expect(supportedIssues).toEqual([]);
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
  it('rejects fixed loot that names an unknown item', () => {
    invalidWithSharedRegistry(withFixedLoot(fixedLootContainer.pos, 'not_an_item'), 'no item');
  });
  it('rejects fixed loot on a non-container', () => {
    const nonContainer = fixedLootTemplate.pieces.find((piece) => !registry.furniture.get(piece.furniture)?.container)!;
    invalidWithSharedRegistry(withFixedLoot(nonContainer.pos, 'rag'), 'has no container');
  });
  it('places military-only fixed loot only in a container that rolls a military table', () => {
    const [military] = militaryLootItems(registry);
    const rolled = registry.loot.get(fixedLootContainer.loot ?? '');
    if (military === undefined || rolled === undefined || rolled.military) {
      throw new Error('fixture needs a military-only item and a non-military container table');
    }
    const fixed = withFixedLoot(fixedLootContainer.pos, military);
    invalidWithSharedRegistry(fixed, 'military loot only');
    const loot = new Map(registry.loot);
    loot.set(rolled.id, { ...rolled, military: true });
    expect(authoredLayoutIssues(fixed, { ...registry, loot })).toEqual([]);
  });
  it('rejects fixed loot without a furniture anchor', () => {
    invalidWithSharedRegistry(withFixedLoot([0, 0, 0], 'rag'), 'no furniture anchor');
  });
  it('rejects an unknown building template', () => {
    invalid({ ...layout, buildings: [{ ...layout.buildings[0], template: 'missing' }] }, 'no template');
  });
  it('reports a placed template with an unknown furniture id instead of throwing', () => {
    const template = {
      id: 'bad_palette',
      size: [1, 1, 1],
      palette: { X: { furniture: 'no_such_furniture' } },
      layers: [['X']],
    };
    const building = { ...layout.buildings[0], template: 'bad_palette', storeys: 1 };
    const data = { templates: [template], layouts: [{ ...layout, id: 'bad_palette_site', buildings: [building] }] };
    const result = buildRegistry([{ source: 'layout-test.json', data }]);
    expect(result.issues.map((issue) => `${issue.path}: ${issue.message}`)).toContain(
      'templates[0].palette["X"].furniture: no furniture "no_such_furniture"',
    );
  });
  it('validates optional windows on authored shambler markers', () => {
    const timed = {
      ...layout,
      shamblers: [{ ...layout.shamblers[0]!, window: { fromGameTimeOfDay: 'dusk', toGameTimeOfDay: 'dawn' } }],
    };
    expect(load(timed).issues.filter((issue) => issue.source === 'layout-test.json')).toEqual([]);
    invalid(
      { ...layout, shamblers: [{ ...layout.shamblers[0]!, window: { fromGameTimeOfDay: 'sunset' } }] },
      'expected a named game time or HH:MM',
    );
    invalid(
      {
        ...layout,
        shamblers: [{ ...layout.shamblers[0]!, window: { fromGameTimeOfDay: 'dusk', toGameTimeOfDay: 'dusk' } }],
      },
      'from and to must differ',
    );
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

it('fades authored terrain noise around structures, tracks and spawn while varying open ground', () => {
  const ridge = registry.layouts.get('hunting_cabins')!;
  const site = new AuthoredSite(73, registry, scale, ridge);
  const terrain: AuthoredTerrainCase = {
    site,
    sourceLayout: ridge,
    lots: ridge.buildings.map((building) =>
      lotOf(building, buildingBounds(building, registry.templates.get(building.template)!.size)),
    ),
    natural: ridge.ground / scale.blockSize,
  };
  expectBuildingApronsUnnoised(terrain);
  expectTracksUnnoised(terrain);
  expectSpawnMarginsUnnoised(terrain);
  expect(openGroundHasNoise(terrain)).toBe(true);
});

it('keeps authored trees grounded and clear of buildings, roads and spawn', () => {
  const ridge = registry.layouts.get('hunting_cabins')!;
  const site = new AuthoredSite(73, registry, makeScale(0.5), ridge);
  const s = makeScale(0.5).blockSize;
  const natural = ridge.ground / s;
  const buildingsInBlocks = ridge.buildings.map((building) => {
    const rect = buildingBounds(building, registry.templates.get(building.template)!.size);
    return { x0: rect.x0 / s, x1: rect.x1 / s, z0: rect.z0 / s, z1: rect.z1 / s };
  });
  const spawnPoints = [
    [ridge.player.position[0], ridge.player.position[2]],
    ...ridge.shamblers.map((spawn) => [spawn.position[0], spawn.position[2]]),
    ...site.placements.flatMap(placedSpawns).map((marker) => [marker.pos[0] * s, marker.pos[2] * s]),
  ];
  const spawnMargin = registry.siteGeneration.get('authored')!.vegetation.obstacleMarginMetres;
  expect(site.trees.length).toBeGreaterThan(0);
  expect(
    site.trees.some(
      (tree) =>
        tree.shape === 'young' &&
        !ridge.woodlands.some((wood) => inPolygon([tree.origin[0] * s, tree.origin[2] * s], wood.polygon)),
    ),
  ).toBe(true);
  for (const tree of site.trees) {
    const [x, y, z] = tree.origin;
    expect(y).toBe(site.surface.height(x, z, natural) + 1);
    expect(buildingsInBlocks.some((rect) => rectsOverlap(rect, tree.bounds))).toBe(false);
    const centreX = ((tree.bounds.x0 + tree.bounds.x1) / 2) * s;
    const centreZ = ((tree.bounds.z0 + tree.bounds.z1) / 2) * s;
    const radius = (Math.hypot(tree.bounds.x1 - tree.bounds.x0, tree.bounds.z1 - tree.bounds.z0) * s) / 2;
    expect(
      ridge.tracks.some((track) => polylineDistance([centreX, centreZ], track.points) <= track.width / 2 + radius),
    ).toBe(false);
    for (const [spawnX, spawnZ] of spawnPoints) {
      expect(Math.hypot(centreX - spawnX!, centreZ - spawnZ!)).toBeGreaterThan(radius + spawnMargin);
    }
  }
});

it('keeps trees out of an authored building covered by woodland', () => {
  const ridge = registry.layouts.get('hunting_cabins')!;
  const { bounds } = ridge;
  const woodlandLayout: SiteLayoutDef = {
    ...ridge,
    id: 'building-in-woodland-fixture',
    buildings: [],
    tracks: [],
    shamblers: [],
    woodlands: [
      {
        polygon: [
          [bounds.x0, bounds.z0],
          [bounds.x1, bounds.z0],
          [bounds.x1, bounds.z1],
          [bounds.x0, bounds.z1],
        ],
        density: 1,
      },
    ],
  };
  const seed = 73;
  const woodlandSite = new AuthoredSite(seed, registry, scale, woodlandLayout);
  const [witness] = woodlandSite.trees;
  if (!witness) {
    throw new Error('woodland fixture needs an unprotected tree witness');
  }
  const sourceBuilding = ridge.buildings[0]!;
  const building: SiteLayoutDef['buildings'][number] = {
    ...sourceBuilding,
    position: [witness.bounds.x0 * scale.blockSize, ridge.ground, witness.bounds.z0 * scale.blockSize],
    rotation: 0,
    storeys: 1,
  };
  const clearanceLayout: SiteLayoutDef = { ...woodlandLayout, buildings: [building] };
  const site = new AuthoredSite(seed, registry, scale, clearanceLayout);
  const metres = buildingBounds(building, registry.templates.get(building.template)!.size);
  const buildingInBlocks = {
    x0: metres.x0 / scale.blockSize,
    x1: metres.x1 / scale.blockSize,
    z0: metres.z0 / scale.blockSize,
    z1: metres.z1 / scale.blockSize,
  };
  expect(rectsOverlap(buildingInBlocks, witness.bounds)).toBe(true);
  expect(site.trees.length).toBeGreaterThan(0);
  expect(site.trees.some((tree) => rectsOverlap(buildingInBlocks, tree.bounds))).toBe(false);
});

it('grounds the exported ridge lots, track and slope trees with order-independent overlapping profiles', () => {
  const ridge = (
    JSON.parse(readFileSync('src/content/base/hunting-cabins.json', 'utf8')) as { layouts: SiteLayoutDef[] }
  ).layouts[0]!;
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
  const ridgeFeature = ridge.terrain.find((feature) => feature.kind === 'ridge')!;
  const ridgePoint: [number, number] = [
    (ridgeFeature.points[0]![0] + ridgeFeature.points.at(-1)![0]) / 2,
    (ridgeFeature.points[0]![1] + ridgeFeature.points.at(-1)![1]) / 2,
  ];
  const addedHill: SiteLayoutDef['terrain'][number] = {
    kind: 'hill',
    centre: ridgePoint,
    radii: [10, 10],
    rise: 3,
  };
  const terrainHeight = profileHeight(ridge, ...ridgePoint);
  const hillHeight = profileHeight({ ...ridge, terrain: [addedHill] }, ...ridgePoint);
  const overlappingHeight = profileHeight({ ...ridge, terrain: [...ridge.terrain, addedHill] }, ...ridgePoint);
  expect(overlappingHeight).toBe(Math.max(terrainHeight, hillHeight));

  const toCell = (x: number, z: number): [number, number] => [
    Math.floor(x / scale.blockSize),
    Math.floor(z / scale.blockSize),
  ];
  const [ridgeX, ridgeZ] = toCell(...ridgePoint);
  const [playerX, , playerZ] = ridge.player.position;
  const [spawnX, spawnZ] = toCell(playerX, playerZ);
  const natural = ridge.ground / scale.blockSize;
  expect(site.surface.height(ridgeX, ridgeZ, natural)).toBeGreaterThan(site.surface.height(spawnX, spawnZ, natural));

  const blendBuilding = ridge.buildings[0]!;
  const blendBounds = buildingBounds(blendBuilding, registry.templates.get(blendBuilding.template)!.size);
  const blendFixture = { ...ridge, buildings: [blendBuilding] };
  const blendSite = new AuthoredSite(73, registry, scale, blendFixture);
  const blendTargetX = blendBounds.x1 + LOT_APRON_M + LOT_BLEND_M / 2;
  const blendX = Math.floor((blendTargetX - scale.blockSize / 2) / scale.blockSize);
  const blendZ = Math.floor((blendBounds.z0 + blendBounds.z1) / 2 / scale.blockSize);
  const blendCentre: [number, number] = [(blendX + 0.5) * scale.blockSize, (blendZ + 0.5) * scale.blockSize];
  const blendDistance = blendCentre[0] - (blendBounds.x1 + LOT_APRON_M - scale.blockSize / 2);
  expect(Math.abs(blendDistance - LOT_BLEND_M / 2)).toBeLessThanOrEqual(scale.blockSize / 2);
  const authoredProfile = profileHeight(blendFixture, ...blendCentre);
  const [, floorHeight] = blendBuilding.position;
  const blendLow = Math.min(floorHeight, authoredProfile);
  const blendHigh = Math.max(floorHeight, authoredProfile);
  const blendedHeight = blendSite.surface.height(blendX, blendZ, natural) * scale.blockSize;
  expect(blendedHeight).toBeGreaterThanOrEqual(blendLow - scale.blockSize / 2);
  expect(blendedHeight).toBeLessThanOrEqual(blendHigh + scale.blockSize / 2);
  const naturalGap = ridge.ground < blendLow ? blendLow - ridge.ground : ridge.ground - blendHigh;
  expect(naturalGap).toBeGreaterThan(scale.blockSize);

  for (const building of ridge.buildings) {
    const bounds = buildingBounds(building, registry.templates.get(building.template)!.size);
    const [x, z] = toCell((bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2);
    expect(site.surface.height(x, z, natural)).toBe(building.position[1] / scale.blockSize);
  }
  const track = ridge.tracks.find((candidate) => candidate.points.length > 1)!;
  const [start, end] = [track.points[0]!, track.points[1]!];
  const [trackX, trackZ] = toCell((start[0] + end[0]) / 2, (start[1] + end[1]) / 2);
  expect(site.surface.top(trackX, trackZ)).toBe(registry.blockIds.get(track.surface ?? 'dirt'));
  expect(standingHeight(ridge, [], playerX, playerZ)).toBe(ridge.player.position[1]);

  const isGrounded = (tree: (typeof site.trees)[number]) => {
    const [x, y, z] = tree.origin;
    return y === site.surface.height(x, z, natural) + 1;
  };
  expect(site.trees.some(isGrounded)).toBe(true);
  for (const tree of site.trees) {
    expect(isGrounded(tree)).toBe(true);
  }
  const columns = siteColumns(site, ridge);
  const a = siteWorld(site, columns, 73);
  const b = siteWorld(reversed, [...columns].reverse(), 73);
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
    buildings: [44, 52, 60, 68, 76, 84].map((cx) => {
      const building = {
        template: 'shed',
        position: [cx - 1.5, 0, 67.5] as [number, number, number],
        rotation: 90 as const,
      };
      building.position[1] = defaultFoundation(ridge, buildingBounds(building, registry.templates.get('shed')!.size));
      return building;
    }),
    tracks: [],
    woodlands: [
      {
        polygon: [
          [38, 62],
          [90, 62],
          [90, 82],
          [38, 82],
        ],
        density: 1,
      },
    ],
  };
  expect(load(fixture).issues).toEqual([]);
  const site = new AuthoredSite(28, registry, scale, fixture);
  // Six steep-flank lots offer several tree-cell opportunities in the uphill blend.
  // Protect grounding, not a particular seeded tree mix or canopy position.
  let witnesses = 0;
  for (const tree of site.trees) {
    const [x, y, z] = tree.origin;
    expect(y).toBe(site.surface.height(x, z, fixture.ground / scale.blockSize) + 1);
    const raw =
      Math.round(profileHeight(fixture, (x + 0.5) * scale.blockSize, (z + 0.5) * scale.blockSize) / scale.blockSize) +
      1;
    if (raw !== y) {
      witnesses += 1;
    }
  }
  expect(witnesses, 'lot blend should affect the grounded height of a woodland tree').toBeGreaterThan(0);
});

it('keeps adjacent lot floors, apron blending and footprint ties independent of building order', () => {
  const lowered = structuredClone(layout);
  const shedIndex = lowered.buildings.findIndex(({ template }) => template === 'shed');
  const houseIndex = lowered.buildings.findIndex(({ storeys }) => (storeys ?? 1) > 1);
  const lowerBuilding = lowered.buildings[shedIndex]!;
  const upperBuilding = lowered.buildings[houseIndex]!;
  lowerBuilding.position[1] = upperBuilding.position[1] - 2;
  const bounds = lowered.buildings.map((building) =>
    buildingBounds(building, registry.templates.get(building.template)!.size),
  );
  const lowerBounds = bounds[shedIndex]!;
  const upperBounds = bounds[houseIndex]!;
  const left = lowerBounds.x0 < upperBounds.x0 ? lowerBounds : upperBounds;
  const right = left === lowerBounds ? upperBounds : lowerBounds;
  const overlapZ0 = Math.max(lowerBounds.z0, upperBounds.z0);
  const overlapZ1 = Math.min(lowerBounds.z1, upperBounds.z1);
  const centerZ = (overlapZ0 + overlapZ1) / 2;
  const lowerIsLeft = left === lowerBounds;
  const apronPoint: [number, number] = [
    lowerIsLeft ? lowerBounds.x1 + LOT_APRON_M / 2 : lowerBounds.x0 - LOT_APRON_M / 2,
    centerZ,
  ];
  const tiePoint: [number, number] = [(left.x1 + right.x0) / 2, centerZ];
  const pointSample = ([x, z]: [number, number]) => [x / scale.blockSize - 0.5, z / scale.blockSize - 0.5] as const;
  const sampleHeights = (site: AuthoredSite) => {
    const lowerCenter = pointSample([(lowerBounds.x0 + lowerBounds.x1) / 2, centerZ]);
    const upperCenter = pointSample([(upperBounds.x0 + upperBounds.x1) / 2, centerZ]);
    return [
      site.surface.height(...lowerCenter, lowered.ground / scale.blockSize),
      site.surface.height(...pointSample(apronPoint), lowered.ground / scale.blockSize),
      site.surface.height(...pointSample(tiePoint), lowered.ground / scale.blockSize),
      site.surface.height(...upperCenter, lowered.ground / scale.blockSize),
    ];
  };
  const ordered = new AuthoredSite(1, registry, scale, lowered);
  const reversedLayout = { ...lowered, buildings: [...lowered.buildings].reverse() };
  const reversed = new AuthoredSite(1, registry, scale, reversedLayout);
  const heights = sampleHeights(ordered);
  expect(sampleHeights(reversed)).toEqual(heights);
  expect(heights[0]!).toBe(lowerBuilding.position[1] / scale.blockSize);
  expect(heights[3]!).toBe(upperBuilding.position[1] / scale.blockSize);
  expect(heights[0]!).toBeLessThan(heights[3]!);
  expect(heights[1]!).toBeGreaterThanOrEqual(heights[0]!);
  expect(heights[1]!).toBeLessThan(heights[3]!);
  expect(heights[2]!).toBeGreaterThanOrEqual(heights[0]!);
  expect(heights[2]!).toBeLessThanOrEqual(heights[3]!);

  const apronX = Math.floor(apronPoint[0] / scale.blockSize);
  const apronZ = Math.floor(apronPoint[1] / scale.blockSize);
  const columns = siteColumns(ordered, lowered);
  columns.push([toChunk(apronX), toChunk(apronZ)]);
  const world = siteWorld(ordered, [...new Map(columns.map((column) => [column.join(','), column])).values()], 1);
  const floorY = Math.floor(lowerBuilding.position[1] / scale.blockSize);
  for (let y = floorY + 1; y <= floorY + LOT_APRON_M / scale.blockSize; y++) {
    expect(world.getBlock(apronX, y, apronZ)).toBe(0);
  }
});

it('stamps the rotated multi-storey house deterministically with supported spawns and upstairs furniture', () => {
  const site = new AuthoredSite(1, registry, scale, layout);
  const columns = siteColumns(site, layout);
  const a = siteWorld(site, columns, 1);
  const b = siteWorld(site, [...columns].reverse(), 1);
  for (const [key, chunk] of a.chunks) {
    expect(Buffer.from(chunk.toArray().buffer).equals(Buffer.from(b.chunks.get(key)!.toArray().buffer)), key).toBe(
      true,
    );
  }

  const spawns = columns.flatMap(([cx, cz]) => site.zombiesIn(cx, cz));
  const hasFloorAndHeadroom = ({ pos }: (typeof spawns)[number]) =>
    registry.blocks[a.getBlock(pos[0], pos[1] - 1, pos[2])!]?.solid === true &&
    a.getBlock(pos[0], pos[1], pos[2]) === 0;
  expect(spawns.some(hasFloorAndHeadroom)).toBe(true);
  for (const spawn of spawns) {
    expect(hasFloorAndHeadroom(spawn)).toBe(true);
  }

  const furniture = columns.flatMap(([cx, cz]) => site.furnitureIn(cx, cz));
  const multiStoreyIndex = layout.buildings.findIndex((building) => (building.storeys ?? 1) > 1);
  expect(multiStoreyIndex).toBeGreaterThanOrEqual(0);
  const multiStoreyBuilding = layout.buildings[multiStoreyIndex]!;
  const placement = site.placements[multiStoreyIndex]!;
  const perStorey = registry.templates.get(multiStoreyBuilding.template)!.size[1] - 1;
  const hasUpstairsBed = furniture.some(
    ({ spec }) => spec.type === 'bed' && spec.pos[1] > placement.origin[1] + perStorey,
  );
  expect(hasUpstairsBed).toBe(true);

  const optionalLayout = {
    ...layout,
    shamblers: layout.shamblers.map((spawn) => ({ ...spawn, chance: 0 })),
  };
  const optional = new AuthoredSite(1, registry, scale, optionalLayout);
  const optionalColumns = siteColumns(optional, optionalLayout);
  expect(optionalColumns.flatMap(([cx, cz]) => optional.zombiesIn(cx, cz))).toEqual([]);
});
