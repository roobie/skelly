// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared property assertions are called only by tests.
import { readFileSync } from 'node:fs';
import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { authoredLayoutIssues } from '../../engine/src/core/authoredLayout.ts';
import { AuthoredSite } from '../../engine/src/core/authoredSite.ts';
import { lootPointStream, rollLoot } from '../../engine/src/core/loot.ts';
import { magazineSpec } from '../../engine/src/core/magazine.ts';
import type { SiteLayoutDef, TemplateDef } from '../../engine/src/core/schema.ts';
import { planFlight, STAIR_BODY_HALF_WIDTH } from '../../engine/src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../../engine/src/core/templateSpatial.ts';
import {
  type CompiledTemplate,
  compileTemplate,
  placedBlockAt,
  placedPieces,
  placedSpawns,
} from '../../engine/src/core/templates.ts';
import { buildRegistry } from '../../engine/src/content.ts';
import { doorOptions, Inventory } from '../../engine/src/inventory.ts';
import { Rng } from '../../engine/src/math.ts';
import type { buildingBounds } from '../../engine/src/terrain.mjs';
import { BLUEPRINTS, CATALOGUE, GLASS, keyVoxel, PartLibrary, VOXEL, wheel } from '../../engine/src/vehicles.ts';
import { type BlockEntity, footprint, makeScale, placedPoint, toChunk } from '../../engine/src/world.ts';
import { vehicleInstanceOf, vehicleModel, workshopLift } from '../src/render/workshopVehicle.ts';
import { baseContentSources } from './baseContentFiles.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureLootPoint } from './economyFixtures.ts';

const sources = baseContentSources().filter(({ source }) => !source.startsWith('layouts') && source !== 'starts.json');
const layout = (
  JSON.parse(readFileSync('mods/skelly.deadvox.scenario.playtest/layouts-playtest.json', 'utf8')) as {
    layouts: SiteLayoutDef[];
  }
).layouts[0]!;
const result = buildRegistry([...sources, { source: 'playtest-layout-test.json', data: { layouts: [layout] } }]);
const scale = makeScale(0.5);
const partLibrary = new PartLibrary(CATALOGUE);
type FixedOverride = NonNullable<SiteLayoutDef['buildings'][number]['fixedLoot']>[number];
interface OverridePlacement {
  building: SiteLayoutDef['buildings'][number];
  buildingIndex: number;
  override: FixedOverride;
}
type Bounds = ReturnType<typeof buildingBounds>;

const compactFixture = (): SiteLayoutDef => ({
  ...layout,
  bounds: layout.bounds,
  woodlands: [],
});

const placedOverrides = (fixture: SiteLayoutDef): OverridePlacement[] =>
  fixture.buildings.flatMap((building, buildingIndex) =>
    (building.fixedLoot ?? []).map((override) => ({ building, buildingIndex, override })),
  );

type LootTable = NonNullable<ReturnType<typeof result.registry.loot.get>>;

const entryDraw = (table: LootTable, index: number): number => {
  const before = table.entries.slice(0, index).reduce((sum, entry) => sum + entry.weight, 0);
  const total = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  return (before + table.entries[index]!.weight / 2) / total;
};

function* entryIndexTuples(entryCount: number, tupleLength: number): Generator<number[]> {
  if (tupleLength === 0) {
    yield [];
    return;
  }
  for (let index = 0; index < entryCount; index++) {
    for (const suffix of entryIndexTuples(entryCount, tupleLength - 1)) {
      yield [index, ...suffix];
    }
  }
}

const maximumLootRoll = (table: LootTable, entryIndexes: readonly number[]) => {
  const values = [0.999_999_999];
  for (const index of entryIndexes) {
    const entry = table.entries[index]!;
    values.push(entryDraw(table, index));
    if (entry.item !== undefined && entry.count !== undefined) {
      values.push(0.999_999_999);
    }
    if (entry.item !== undefined && entry.condition !== undefined) {
      values.push(0.999_999_999);
    }
  }
  const rng = new Rng([0, 0, 0, 0]);
  rng.next = () => {
    const value = values.shift();
    if (value === undefined) {
      throw new Error('Unexpected random draw while rolling armoury loot');
    }
    return value;
  };
  const rolled = rollLoot(
    result.registry,
    fixtureLootPoint({ kind: 'table', table: table.id }, { usage: ['Military'], tier: 'Tier2' }),
    rng,
  );
  if (values.length > 0) {
    throw new Error('Unconsumed random draws while rolling armoury loot');
  }
  return rolled;
};

const itemCounts = (items: readonly { type: string; count: number }[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + item.count);
  }
  return counts;
};

const possibleLootItems = (tableId: string): Set<string> => {
  const table = result.registry.loot.get(tableId);
  if (!table) {
    throw new Error(`Unknown loot table: ${tableId}`);
  }
  const items = new Set<string>();
  for (const entry of table.entries) {
    if (entry.item !== undefined) {
      items.add(entry.item);
      continue;
    }
    if (entry.table !== undefined) {
      for (const item of possibleLootItems(entry.table)) {
        items.add(item);
      }
    }
  }
  return items;
};

const withTestEntrance = (template: CompiledTemplate, target: readonly [number, number, number]): CompiledTemplate => {
  if (template.access) {
    return template;
  }
  const [sx, , sz] = template.size;
  const doors = template.pieces.filter((piece) => result.registry.furniture.get(piece.furniture)?.door);
  const edgeDistance = (piece: (typeof doors)[number]): number =>
    Math.min(piece.pos[0], piece.pos[2], sx - piece.pos[0] - piece.size[0], sz - piece.pos[2] - piece.size[2]);
  const targetDistance = (piece: (typeof doors)[number]): number =>
    Math.abs(piece.pos[0] + piece.size[0] / 2 - target[0]) + Math.abs(piece.pos[2] + piece.size[2] / 2 - target[2]);
  const [door] = [...doors].sort((a, b) => edgeDistance(a) - edgeDistance(b) || targetDistance(a) - targetDistance(b));
  if (!door) {
    throw new Error(`${template.id} has fixed loot but no door from outside`);
  }
  const centerX = door.pos[0] + door.size[0] / 2;
  const centerZ = door.pos[2] + door.size[2] / 2;
  const facesZ = door.size[0] > door.size[2];
  const direction = Math.sign(target[facesZ ? 2 : 0] - (facesZ ? centerZ : centerX)) || 1;
  const entrance: [number, number, number] = facesZ
    ? [centerX, target[1], centerZ + direction * (door.size[2] / 2 + 0.5)]
    : [centerX + direction * (door.size[0] / 2 + 0.5), target[1], centerZ];
  return {
    ...template,
    access: { ground: 'ground', entrance, storeys: [{ id: 'ground', floor: target[1] }], stairs: [] },
  };
};

const stairOpeningCells = (placement: AuthoredSite['placements'][number]): Set<string> => {
  const groundLayer = placement.template.groundLayer ?? 0;
  const cells = new Set<string>();
  for (const stair of placement.template.access?.stairs ?? []) {
    const flight = planFlight(stair, placement.template.size);
    if (!flight) {
      throw new Error(`${placement.template.id} has invalid stair geometry`);
    }
    if (groundLayer !== stair.upper[1] - 1) {
      continue;
    }
    for (let step = 0; step < flight.rise; step++) {
      for (const [x, , z] of flight.row(step)) {
        const [worldX, , worldZ] = placedPoint(placement, [x + 0.5, groundLayer, z + 0.5]);
        cells.add(`${Math.floor(worldX)},${Math.floor(worldZ)}`);
      }
    }
  }
  return cells;
};

const expectGroundedPlacement = (site: AuthoredSite, placement: AuthoredSite['placements'][number]): void => {
  const [x0, y0, z0] = placement.origin;
  const [width, depth] = footprint(placement);
  const groundY = y0 + (placement.template.groundLayer ?? 0);
  const openings = stairOpeningCells(placement);
  let foundationCells = 0;
  for (let x = x0; x < x0 + width; x++) {
    for (let z = z0; z < z0 + depth; z++) {
      const block = placedBlockAt(placement, [x, groundY, z]);
      if (block === undefined || !result.registry.blocks[block]?.solid) {
        expect(openings.has(`${x},${z}`), `${placement.template.id} at ${x},${z} is an access stair opening`).toBe(
          true,
        );
        continue;
      }
      foundationCells += 1;
      expect(site.surface.height(x, z, layout.ground / scale.blockSize), `${placement.template.id} at ${x},${z}`).toBe(
        groundY,
      );
    }
  }
  expect(foundationCells, `${placement.template.id} has ground-layer support`).toBeGreaterThan(0);
};

const columnsFor = (site: AuthoredSite, fixture: SiteLayoutDef): [number, number][] => {
  const columns = new Map<string, [number, number]>();
  for (const placement of site.placements) {
    const [width, depth] = footprint(placement);
    for (let cx = toChunk(placement.origin[0]); cx <= toChunk(placement.origin[0] + width - 1); cx += 1) {
      for (let cz = toChunk(placement.origin[2]); cz <= toChunk(placement.origin[2] + depth - 1); cz += 1) {
        columns.set(`${cx},${cz}`, [cx, cz]);
      }
    }
  }
  for (const spawn of fixture.shamblers) {
    const cx = toChunk(Math.floor(spawn.position[0] / scale.blockSize));
    const cz = toChunk(Math.floor(spawn.position[2] / scale.blockSize));
    columns.set(`${cx},${cz}`, [cx, cz]);
  }
  return [...columns.values()];
};

type DoorCell = [number, number, number];

const solidInPlacements = (placements: AuthoredSite['placements'], cell: DoorCell): boolean =>
  placements.some((placement) => {
    const block = placedBlockAt(placement, cell);
    if (block !== undefined && result.registry.blocks[block]?.solid) {
      return true;
    }
    return placedPieces(placement).some((piece) => {
      const def = result.registry.furniture.get(piece.furniture)!;
      return (
        !def.door &&
        def.solid !== false &&
        cell[0] >= piece.pos[0] &&
        cell[0] < piece.pos[0] + piece.size[0] &&
        cell[1] >= piece.pos[1] &&
        cell[1] < piece.pos[1] + piece.size[1] &&
        cell[2] >= piece.pos[2] &&
        cell[2] < piece.pos[2] + piece.size[2]
      );
    });
  });

const furnishInOrder = (site: AuthoredSite, columns: [number, number][]): Inventory => {
  const inventory = new Inventory(result.registry);
  for (const [cx, cz] of columns) {
    for (const { spec, loot, surfaceLoot } of site.furnitureIn(cx, cz)) {
      inventory.furnish(spec, loot, surfaceLoot);
    }
  }
  return inventory;
};

const contents = (inventory: Inventory) => ({
  furniture: [...inventory.entities.all]
    .map((entity) => [
      entity.pos.join(','),
      (entity.pockets ?? []).map((pocket) =>
        pocket
          .map(({ item, x, y }) => [item.type, item.count, item.condition, x, y] as const)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b))),
  piles: [...inventory.piles.values()]
    .map((pile) => [
      pile.pos.join(','),
      pile.items
        .map(({ item }) => [item.type, item.count, item.condition] as const)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b))),
});

const fixedItemCounts = (
  site: AuthoredSite,
  inventory: Inventory,
  { buildingIndex, override }: OverridePlacement,
): { expected: number; found: number; item: string }[] => {
  const placement = site.placements[buildingIndex]!;
  const localIndex = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === override.at.join(','));
  const placed = placedPieces(placement)[localIndex];
  const entity = placed && inventory.entities.at(...placed.pos);
  const found = (entity?.pockets ?? []).flatMap((pocket) => pocket.map(({ item }) => item));
  return override.items.map((fixed) => {
    const items =
      fixed.placement === 'surface'
        ? [...inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item))
        : found;
    return {
      item: fixed.item,
      expected: fixed.count ?? 1,
      found: items
        .filter((item) => item.type === fixed.item && item.condition === (fixed.condition ?? 1))
        .reduce((sum, item) => sum + item.count, 0),
    };
  });
};

const seededFillerCounts = (
  site: AuthoredSite,
  override: OverridePlacement,
): { expected: number; found: number }[] | undefined => {
  const placement = site.placements[override.buildingIndex]!;
  const localIndex = placement.template.pieces.findIndex(
    (piece) => piece.pos.join(',') === override.override.at.join(','),
  );
  const localPiece = placement.template.pieces[localIndex]!;
  if (localPiece.loot === undefined) {
    return undefined;
  }
  const placed = placedPieces(placement)[localIndex]!;
  const point = site
    .lootPointsIn(toChunk(placed.pos[0]), toChunk(placed.pos[2]))
    .find((source) => source.channel === 'container' && source.destination.join(',') === placed.pos.join(','))!;
  const seeded = rollLoot(
    result.registry,
    { ...point, supply: { kind: 'table', table: localPiece.loot } },
    lootPointStream(73, point),
  );
  if (seeded.length === 0) {
    return undefined;
  }
  const actual = site
    .furnitureIn(toChunk(placed.pos[0]), toChunk(placed.pos[2]))
    .find((spawn) => spawn.spec.pos.join(',') === placed.pos.join(','))!.loot;
  return seeded.map((item) => ({
    expected: item.count,
    found: actual
      .filter((candidate) => candidate.type === item.type && candidate.condition === item.condition)
      .reduce((sum, candidate) => sum + candidate.count, 0),
  }));
};

const gapToBounds = (x: number, z: number, rect: Bounds): number =>
  Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1));

describe('authored fixed loot', () => {
  it('grounds every authored building on solid terrain', () => {
    const site = new AuthoredSite(73, result.registry, scale, layout);
    expect(site.placements.length).toBeGreaterThan(0);
    for (const placement of site.placements) {
      expectGroundedPlacement(site, placement);
    }
  });

  it('delivers fixed loot beside seed filler, leaves placed firearms unloaded, and is chunk-order independent', () => {
    expect(result.issues).toEqual([]);
    const fixture = compactFixture();
    const site = new AuthoredSite(73, result.registry, scale, fixture);
    const columns = columnsFor(site, fixture);
    const forward = furnishInOrder(site, columns);
    const reverse = furnishInOrder(site, [...columns].reverse());
    const overrides = placedOverrides(fixture);
    expect(overrides.length).toBeGreaterThan(0);
    const fixedCounts = overrides.flatMap((override) => fixedItemCounts(site, forward, override));
    expect(fixedCounts.length).toBeGreaterThan(0);
    for (const fixed of fixedCounts) {
      expect(fixed.found, fixed.item).toBeGreaterThanOrEqual(fixed.expected);
    }
    const seededCounts = overrides.flatMap((override) => seededFillerCounts(site, override) ?? []);
    expect(seededCounts.length).toBeGreaterThan(0);
    for (const seeded of seededCounts) {
      expect(seeded.found).toBeGreaterThanOrEqual(seeded.expected);
    }
    const placedItems = [...forward.entities.all].flatMap((entity) =>
      (entity.pockets ?? []).flatMap((pocket) => pocket.map(({ item }) => item)),
    );
    const firearms = placedItems.filter(({ type }) => result.registry.items.get(type)?.firearm !== undefined);
    expect(firearms.length).toBeGreaterThan(0);
    for (const { type, firearm, slots } of firearms) {
      const rounds = [
        ...(firearm?.tube ?? []),
        ...(firearm?.roundType ? [firearm.roundType] : []),
        ...(firearm?.cylinder?.chambers.filter(({ state }) => state === 'round') ?? []),
      ];
      expect(firearm?.chamber, type).not.toBe('round');
      expect(rounds, type).toEqual([]);
      expect(slots?.magazine, type).toBeUndefined();
    }
    const magazines = placedItems.filter(({ type }) => magazineSpec(result.registry, type) !== undefined);
    expect(magazines.length).toBeGreaterThan(0);
    expect(magazines.every((magazine) => (magazine.cartridges ?? []).length === 0)).toBe(true);
    expect(contents(forward)).toEqual(contents(reverse));
  });

  it('supplies the starting house with the components for its light recipe', () => {
    const overrides = placedOverrides(layout);
    const house = overrides.filter(({ building }) => building.template === 'playtest_house');

    const houseCounts = new Map<string, number>();
    for (const { override } of house) {
      for (const fixed of override.items) {
        houseCounts.set(fixed.item, (houseCounts.get(fixed.item) ?? 0) + (fixed.count ?? 1));
      }
    }
    const torch = result.registry.recipes.get('torch');
    expect(torch).toBeDefined();
    for (const alternatives of torch!.components) {
      expect(
        alternatives.some(
          (ingredient) => 'item' in ingredient && (houseCounts.get(ingredient.item) ?? 0) >= ingredient.count,
        ),
      ).toBe(true);
    }
  });

  it('covers the light-mount and suppressor recipe components from workshop fixed loot and the scrap pile', () => {
    const overrides = placedOverrides(layout);
    const garageTemplates = ['workshop_hall', 'workshop_office', 'workshop_parts_store'];
    const garageTemplateIds = [...garageTemplates, 'workshop_yard'];
    const garageItems = overrides
      .filter(({ building }) => garageTemplates.includes(building.template))
      .flatMap(({ override }) => override.items);
    const itemCount = (items: typeof garageItems, item: string) =>
      items.filter((fixed) => fixed.item === item).reduce((sum, fixed) => sum + (fixed.count ?? 1), 0);

    const recipes = [...result.registry.recipes.values()];
    const mountRecipe = recipes.find(({ result: recipeResult }) => recipeResult.item === 'taped_flashlight_mount');
    const suppressorRecipe = recipes.find(({ result: recipeResult }) => recipeResult.item === 'improvised_suppressor');
    expect(mountRecipe).toBeDefined();
    expect(suppressorRecipe).toBeDefined();
    const hardware = mountRecipe!.components.filter((alternatives) =>
      alternatives.every(
        (ingredient) => 'item' in ingredient && result.registry.items.get(ingredient.item)?.light === undefined,
      ),
    );
    expect(hardware.length).toBeGreaterThan(0);
    expect(
      hardware.every((alternatives) =>
        alternatives.some(
          (ingredient) => 'item' in ingredient && itemCount(garageItems, ingredient.item) >= ingredient.count,
        ),
      ),
    ).toBe(true);

    const hall = compileTemplate(result.registry, result.registry.templates.get('workshop_hall')!);
    const bench = hall.pieces.find(({ furniture }) => furniture === 'workbench');
    const workstation = bench && result.registry.furniture.get(bench.furniture)?.workstation;
    expect(workstation).toBeDefined();
    expect(mountRecipe!.workstation).toBe(workstation!.id);
    expect(suppressorRecipe!.workstation).toBe(workstation!.id);
    const qualitiesAvailable = (recipe: NonNullable<typeof mountRecipe>) =>
      Object.entries(recipe.qualities).every(
        ([quality, level]) =>
          (workstation!.qualities[quality] ?? 0) >= level ||
          garageItems.some((fixed) => (result.registry.items.get(fixed.item)?.tool?.qualities[quality] ?? 0) >= level),
      );
    expect(qualitiesAvailable(mountRecipe!)).toBe(true);
    expect(qualitiesAvailable(suppressorRecipe!)).toBe(true);

    const workshopCounts = new Map<string, number>();
    for (const fixed of garageItems) {
      workshopCounts.set(fixed.item, (workshopCounts.get(fixed.item) ?? 0) + (fixed.count ?? 1));
    }
    const missingGroups = suppressorRecipe!.components.filter(
      (alternatives) =>
        !alternatives.some(
          (ingredient) => 'item' in ingredient && (workshopCounts.get(ingredient.item) ?? 0) >= ingredient.count,
        ),
    );
    const garageRandomTables = garageTemplateIds.flatMap((templateId) =>
      compileTemplate(result.registry, result.registry.templates.get(templateId)!).pieces.flatMap((piece) =>
        piece.loot ? [piece.loot] : [],
      ),
    );
    expect(garageRandomTables.length).toBeGreaterThan(0);
    const garageRandomItems = new Set(garageRandomTables.flatMap((tableId) => [...possibleLootItems(tableId)]));
    expect(garageRandomItems.size).toBeGreaterThan(0);
    expect(garageRandomItems.has(mountRecipe!.result.item)).toBe(false);
    expect(garageRandomItems.has(suppressorRecipe!.result.item)).toBe(false);

    const scrapPile = compileTemplate(result.registry, result.registry.templates.get('workshop_yard')!).pieces.find(
      ({ furniture }) => furniture === 'workshop_scrap_pile',
    );
    expect(scrapPile?.loot).toBeDefined();
    const pileOverride = overrides.find(
      ({ building, override }) =>
        building.template === 'workshop_yard' && override.at.join(',') === scrapPile!.pos.join(','),
    );
    const pileItems = pileOverride?.override.items ?? [];
    // Each suppressor input the garage does not fix is guaranteed only at the scrap pile, never by a random table.
    for (const group of missingGroups) {
      expect(group.some((input) => 'item' in input && itemCount(pileItems, input.item) >= input.count)).toBe(true);
      expect(group.some((input) => 'item' in input && garageRandomItems.has(input.item))).toBe(false);
    }
  });

  it('admits surface loot through a stacked placement with its authored source context', () => {
    const template: TemplateDef = {
      id: 'fixture_military',
      lootContext: { usage: ['Military'], tier: 'Tier1' },
      size: [2, 3, 2],
      palette: { '.': 'air', S: { furniture: 'fixture_shelf' } },
      layers: [
        ['..', '..'],
        ['S.', '..'],
        ['..', '..'],
      ],
    };
    const registry = {
      ...result.registry,
      templates: new Map([[template.id, template]]),
      furniture: new Map([
        [
          'fixture_shelf',
          {
            id: 'fixture_shelf',
            name: 'Shelf',
            color: '#888888',
            size: [1, 1, 1] as [number, number, number],
            solid: false,
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
          },
        ],
      ]),
      items: new Map([
        [
          'fixture_gear',
          {
            id: 'fixture_gear',
            name: 'Fixture gear',
            category: 'material' as const,
            weight: 1,
            size: [1, 1] as [number, number],
            workInProgress: false,
          },
        ],
      ]),
      itemEconomy: new Map([
        [
          'fixture_gear',
          { id: 'fixture_gear', usage: ['Military' as const], tiers: ['Tier1' as const], notLoot: false },
        ],
      ]),
    };
    const fixture: SiteLayoutDef = {
      ...layout,
      bounds: { x0: 0, z0: 0, x1: 10, z1: 10 },
      ground: 0,
      player: { ...layout.player, position: [8, 0.5, 8] },
      buildings: [
        {
          template: template.id,
          position: [1, 0, 1],
          rotation: 0,
          storeys: 2,
          fixedLoot: [{ at: [0, 1, 0], items: [{ item: 'fixture_gear', placement: 'surface' }] }],
        },
      ],
      terrain: [],
      woodlands: [],
      tracks: [],
      shamblers: [],
      hordes: [],
      beats: [],
    };

    expect(authoredLayoutIssues(fixture, registry)).toEqual([]);
  });

  it('rejects fitted-item data when fixed loot gives a sling to an item without slots', () => {
    const buildingIndex = layout.buildings.findIndex((candidate) => candidate.fixedLoot?.length);
    const building = layout.buildings[buildingIndex];
    if (!building?.fixedLoot?.length) {
      throw new Error('the layout fixture needs a fixed-loot anchor');
    }
    const { fixedLoot } = building;
    const override = fixedLoot[0]!;
    const itemIndex = override.items.length;
    const issuePath = `.buildings[${buildingIndex}].fixedLoot[0].items[${itemIndex}].item`;
    const issuesFor = (item: FixedOverride['items'][number]) => {
      const buildings = [...layout.buildings];
      buildings[buildingIndex] = {
        ...building,
        fixedLoot: [{ ...override, items: [...override.items, item] }, ...fixedLoot.slice(1)],
      };
      return authoredLayoutIssues({ ...layout, buildings }, result.registry);
    };

    expect(issuesFor({ item: 'crowbar' })).not.toContainEqual([issuePath, expect.any(String)]);
    expect(issuesFor({ item: 'crowbar', fitted: { sling: 'weapon_sling' } })).toContainEqual([
      issuePath,
      expect.any(String),
    ]);
  });

  it('puts a readable HQ clue and matching safe key in accessible world containers', () => {
    const site = new AuthoredSite(73, result.registry, scale, layout);
    const hqIndex = layout.buildings.findIndex(({ template }) => template === 'camp_hq');
    const hqPieces = placedPieces(site.placements[hqIndex]!);
    const columns = new Map<string, [number, number]>();
    for (const piece of hqPieces) {
      const column: [number, number] = [toChunk(piece.pos[0]), toChunk(piece.pos[2])];
      columns.set(column.join(','), column);
    }
    const spawns = [...columns.values()].flatMap(([cx, cz]) => site.furnitureIn(cx, cz));
    const safePiece = hqPieces.find((piece) => piece.furniture === 'camp_hq_safe')!;
    const safeSpawn = spawns.find(({ spec }) => spec.pos.join(',') === safePiece.pos.join(','))!;
    const lockId = safeSpawn.spec.lock!.id;
    const hqDefinition = result.registry.templates.get('camp_hq')!;
    const clueOverrides = (layout.buildings[hqIndex]!.fixedLoot ?? []).filter(({ items }) =>
      items.some(
        ({ item, placement }) => placement !== 'surface' && result.registry.items.get(item)?.readable !== undefined,
      ),
    );
    expect(clueOverrides.length).toBeGreaterThan(0);
    for (const clueOverride of clueOverrides) {
      const clueItem = clueOverride.items.find(
        ({ item, placement }) => placement !== 'surface' && result.registry.items.get(item)?.readable !== undefined,
      )!;
      const cluePiece = compileTemplate(result.registry, hqDefinition).pieces.find(
        (piece) => piece.pos.join(',') === clueOverride.at.join(','),
      );
      expect(cluePiece).toBeDefined();
      if (!cluePiece) {
        throw new Error('the HQ clue needs a furniture anchor');
      }
      expect(result.registry.furniture.get(cluePiece.furniture)?.container).toBeDefined();
      expect(cluePiece.lock).toBeUndefined();
      expect(spawns.some(({ loot }) => loot.some(({ type }) => type === clueItem.item))).toBe(true);
    }
    const keySpawn = spawns.find(({ loot }) =>
      loot.some(({ type }) => result.registry.items.get(type)?.key?.lock === lockId),
    );
    expect(keySpawn).toBeDefined();

    const inventory = furnishInOrder(site, [...columns.values()]);
    const door = inventory.entities.at(...safeSpawn.spec.pos)!;
    const heldKey = [...inventory.items()].find(
      ({ item }) => result.registry.items.get(item.type)?.key?.lock === lockId,
    )?.item;
    expect(heldKey).toBeDefined();
    inventory.entities.markSearched(inventory.entities.at(...keySpawn!.spec.pos)!);
    const transfer = inventory.move(heldKey!, { kind: 'hand', side: 'right' });
    expect(transfer.ok, transfer.ok ? undefined : transfer.reason).toBe(true);
    expect(doorOptions(inventory, door)[1]!.plan.ok).toBe(true);
    const keyLock = result.registry.items.get(heldKey!.type)!.key!.lock;
    expect(inventory.entities.setLocked(door, false, [keyLock])).toBeUndefined();
    expect(inventory.entities.setOpen(door, true)).toBeUndefined();
  });

  it('places worst-case rolls from every FOB armoury container', () => {
    const armoury = layout.buildings.find(({ template: id }) => id === 'camp_armoury')!;
    const definition = result.registry.templates.get(armoury.template)!;
    const compiled = compileTemplate(result.registry, definition);
    const table = result.registry.loot.get('military_armoury')!;
    const containers = compiled.pieces.filter((piece) => piece.loot === table.id);
    expect(containers.length).toBeGreaterThan(0);

    for (const piece of containers) {
      const override = armoury.fixedLoot?.find(({ at }) => at.join(',') === piece.pos.join(','));
      const fixed = rollLoot(
        result.registry,
        fixtureLootPoint(
          { kind: 'fixed', items: override?.items ?? [] },
          armoury.lootContext ?? definition.lootContext,
        ),
        Rng.stream(1, 'fixed'),
      );
      for (const entryIndexes of entryIndexTuples(table.entries.length, table.rolls[1])) {
        const rolled = maximumLootRoll(table, entryIndexes);
        const supplied = [...fixed, ...rolled];
        const inventory = new Inventory(result.registry);
        const entity = inventory.furnish(
          { type: piece.furniture, pos: piece.pos, size: piece.size, facing: piece.facing },
          supplied,
        );
        const label = `${piece.furniture}: ${entryIndexes.join(', ')}`;
        expect(entity, label).toBeDefined();
        const placed = (entity!.pockets?.flat() ?? []).map(({ item }) => ({ type: item.type, count: item.count }));
        expect(itemCounts(placed), label).toEqual(itemCounts(supplied));
      }
    }
  });

  it.each(layout.beats!)('keeps $id fixed loot reachable from outside at standing height', (beat) => {
    const buildings = layout.buildings.filter((building) => {
      if (!building.fixedLoot?.length) {
        return false;
      }
      const [x, , z] = building.position;
      const nearestBeat = layout.beats!.reduce((nearest, candidate) =>
        gapToBounds(x, z, candidate.area) < gapToBounds(x, z, nearest.area) ? candidate : nearest,
      );
      return nearestBeat === beat;
    });
    expect(buildings.length).toBeGreaterThan(0);
    for (const building of buildings) {
      const definition = result.registry.templates.get(building.template)!;
      const compiled = compileTemplate(result.registry, definition);
      const walking = withTestEntrance(compiled, building.fixedLoot![0]!.at);
      expect(
        templateSpatialIssues(result.registry, walking),
        `${building.template}: ${walking.access?.entrance}`,
      ).toEqual([]);
      const reachable = templateReachableStandingPositions(result.registry, walking);
      expect(reachable.length, building.template).toBeGreaterThan(0);
      for (const override of building.fixedLoot!) {
        const container = compiled.pieces.find((piece) => piece.pos.join(',') === override.at.join(','));
        expect(container, `${building.template} at ${override.at.join(',')}`).toBeDefined();
        const [x, , z] = container!.pos;
        const [width, , depth] = container!.size;
        const nearContainer = reachable.some(([px, feet, pz]) => {
          if (feet !== override.at[1]) {
            return false;
          }
          const dx = Math.max(x - px, 0, px - (x + width));
          const dz = Math.max(z - pz, 0, pz - (z + depth));
          return Math.hypot(dx, dz) <= STAIR_BODY_HALF_WIDTH + 0.5;
        });
        expect(nearContainer, `${building.template} at ${override.at.join(',')}`).toBe(true);
      }
    }
  });

  it('rests HQ freestanding fixtures on floors or solid furniture tops', () => {
    const source = result.registry.layouts.get('crisis_hq')!;
    const site = new AuthoredSite(73, result.registry, scale, source);
    const placements = site.placements.filter(({ template }) => template.access);
    const pieces = placements
      .flatMap(placedPieces)
      .filter((piece) => result.registry.furniture.get(piece.furniture)!.mount !== 'wall');
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      const [x, y, z] = piece.pos;
      for (let dx = 0; dx < piece.size[0]; dx++) {
        for (let dz = 0; dz < piece.size[2]; dz++) {
          const support: DoorCell = [x + dx, y - 1, z + dz];
          expect(solidInPlacements(placements, support), `${piece.furniture} support at ${support}`).toBe(true);
        }
      }
    }
  });

  it("rests a wheelless vehicle's lowest solid voxel on the arms of the lift it stands on", () => {
    const blueprint = Object.values(BLUEPRINTS)[0]!;
    const carLook = {
      blueprint: blueprint.id,
      body: '#808080',
      dirt: 0,
      removed: blueprint.fittings.filter(({ type }) => type === wheel.type.id).map(({ id }) => id),
      solidFill: 0.5,
    };
    const fixtureCar = vehicleInstanceOf(carLook);
    expect(fixtureCar.fittings.length).toBeGreaterThan(0);
    const lowestSolidVoxelY = Math.min(
      ...fixtureCar.fittings.flatMap((fitting) =>
        [...partLibrary.placed(fitting).grid].flatMap(([voxel, material]) =>
          material === GLASS ? [] : [keyVoxel(voxel)[1]],
        ),
      ),
    );
    const entity = (uid: number, type: string, pos: DoorCell, size: DoorCell): BlockEntity => ({
      uid,
      type,
      origin: pos,
      pos,
      size,
      facing: 'n',
      carried: false,
      searched: false,
      open: false,
    });
    const lift = entity(1, 'fixture_lift', [2, 1, 3], [4, 1, 9]);
    const carSize: DoorCell = [4, 4, 9];
    const car = entity(2, 'fixture_car', [lift.pos[0], lift.pos[1] + lift.size[1], lift.pos[2]], carSize);
    const carBottom = vehicleModel(car, carLook, carSize[1]).position.y + lowestSolidVoxelY * VOXEL;
    const liftView = workshopLift(lift);
    const armTops = liftView.children
      .filter(
        (child): child is Mesh =>
          child instanceof Mesh && child.scale.y < child.scale.x && child.scale.y < child.scale.z,
      )
      .map((arm) => liftView.position.y + arm.position.y + arm.scale.y / 2);
    expect(armTops.length).toBeGreaterThan(0);
    expect(carBottom, 'lowest solid voxel meets lift arms without a gap').toBe(Math.max(...armTops));
  });

  it('spawns every always-spawning template marker as its own kind at its own position', () => {
    const site = new AuthoredSite(73, result.registry, scale, layout);
    const markers = site.placements.flatMap(placedSpawns).filter(({ chance }) => chance >= 1);
    const spawns = columnsFor(site, layout).flatMap(([cx, cz]) => site.actorsIn(cx, cz));

    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(
        spawns.some(
          ({ type, pos }) => type === marker.actor && pos.every((coordinate, axis) => coordinate === marker.pos[axis]),
        ),
        `${marker.actor} at ${marker.pos.join(',')}`,
      ).toBe(true);
    }
  });
});
