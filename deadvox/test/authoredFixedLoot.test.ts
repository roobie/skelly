import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildingBounds, polylineDistance } from '../src/core/authoredTerrain.mjs';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { toChunk } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { rollLoot } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { compileTemplate, footprint, placedPieces } from '../src/core/templates.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const layout = (
  JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as { layouts: SiteLayoutDef[] }
).layouts[0]!;
const result = buildRegistry([...sources, { source: 'playtest-layout-test.json', data: { layouts: [layout] } }]);
const scale = makeScale(0.5);
type FixedOverride = NonNullable<SiteLayoutDef['buildings'][number]['fixedLoot']>[number];
interface OverridePlacement {
  building: SiteLayoutDef['buildings'][number];
  buildingIndex: number;
  override: FixedOverride;
}
type Point = [number, number];
type Bounds = ReturnType<typeof buildingBounds>;

const compactFixture = (): SiteLayoutDef => ({
  ...layout,
  bounds: { x0: 85, z0: 40, x1: 370, z1: 180 },
  woodlands: [],
});

const placedOverrides = (fixture: SiteLayoutDef): OverridePlacement[] =>
  fixture.buildings.flatMap((building, buildingIndex) =>
    (building.fixedLoot ?? []).map((override) => ({ building, buildingIndex, override })),
  );

const fixedCount = (placements: OverridePlacement[], template: string, item: string): number =>
  placements
    .filter(({ building }) => building.template === template)
    .flatMap(({ override }) => override.items)
    .filter((fixed) => fixed.item === item)
    .reduce((sum, fixed) => sum + (fixed.count ?? 1), 0);

const overrideFor = (placements: OverridePlacement[], template: string, item: string) =>
  placements.find(
    ({ building, override }) => building.template === template && override.items.some((fixed) => fixed.item === item),
  );

const furnitureAt = ({ building, override }: OverridePlacement): string | undefined => {
  const template = result.registry.templates.get(building.template);
  return (
    template &&
    compileTemplate(result.registry, template).pieces.find((piece) => piece.pos.join(',') === override.at.join(','))
      ?.furniture
  );
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

const furnishInOrder = (site: AuthoredSite, columns: [number, number][]): Inventory => {
  const inventory = new Inventory(result.registry);
  for (const [cx, cz] of columns) {
    for (const { spec, loot } of site.furnitureIn(cx, cz)) {
      inventory.furnish(spec, loot);
    }
  }
  return inventory;
};

const contents = (inventory: Inventory) =>
  [...inventory.entities.all]
    .map((entity) => [
      entity.pos.join(','),
      (entity.pockets ?? []).map((pocket) =>
        pocket
          .map(({ item, x, y }) => [item.type, item.count, item.condition, x, y] as const)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));

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
  return override.items.map((fixed) => ({
    item: fixed.item,
    expected: fixed.count ?? 1,
    found: found
      .filter((item) => item.type === fixed.item && item.condition === (fixed.condition ?? 1))
      .reduce((sum, item) => sum + item.count, 0),
  }));
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
  const seeded = rollLoot(result.registry, localPiece.loot, Rng.stream(73, `loot:${placed.pos.join(',')}`));
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

const storefrontDoorSolids = (registry: Registry): boolean[] => {
  const store = compileTemplate(registry, registry.templates.get('corner_store')!);
  const door = store.pieces.find((piece) => piece.furniture === 'wood_door' && piece.pos[2] === 0)!;
  const [sx, , sz] = store.size;
  const solids: boolean[] = [];
  for (let x = 0; x < door.size[0]; x += 1) {
    for (let y = 0; y < door.size[1]; y += 1) {
      const block = store.blocks[door.pos[0] + x + sx * (door.pos[2] + 1 + sz * (door.pos[1] + y))]!;
      solids.push(registry.blocks[block]?.solid === true);
    }
  }
  return solids;
};

const gapToBounds = (x: number, z: number, rect: Bounds): number =>
  Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1));

const sampleRoute = (
  site: AuthoredSite,
  fixture: SiteLayoutDef,
  rects: Bounds[],
): { samples: Point[]; minBuildingClearance: number; maxHeightStep: number; allOnTrackSurface: boolean } => {
  const track = fixture.tracks[0]!;
  const samples: Point[] = [];
  let previousHeight: number | undefined;
  let minBuildingClearance = Number.POSITIVE_INFINITY;
  let maxHeightStep = 0;
  let allOnTrackSurface = true;
  for (let segment = 0; segment < track.points.length - 1; segment += 1) {
    const from = track.points[segment]!;
    const to = track.points[segment + 1]!;
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.25);
    for (let step = segment === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      const x = from[0] + (to[0] - from[0]) * t;
      const z = from[1] + (to[1] - from[1]) * t;
      samples.push([x, z]);
      for (const rect of rects) {
        minBuildingClearance = Math.min(minBuildingClearance, gapToBounds(x, z, rect));
      }
      const cellX = Math.floor(x / scale.blockSize);
      const cellZ = Math.floor(z / scale.blockSize);
      const height = site.surface.height(cellX, cellZ, fixture.ground / scale.blockSize);
      if (previousHeight !== undefined) {
        maxHeightStep = Math.max(maxHeightStep, Math.abs(height - previousHeight));
      }
      previousHeight = height;
      allOnTrackSurface &&= site.surface.top(cellX, cellZ) === result.registry.blockIds.get(track.surface ?? 'dirt');
    }
  }
  return { samples, minBuildingClearance, maxHeightStep, allOnTrackSurface };
};

const nearestAreaDistance = (
  fixture: SiteLayoutDef,
  rects: Bounds[],
  samples: Point[],
  templates: readonly string[],
): { count: number; distance: number } => {
  const areaRects = fixture.buildings
    .map((building, index) => ({ building, rect: rects[index]! }))
    .filter(({ building }) => templates.includes(building.template))
    .map(({ rect }) => rect);
  return {
    count: areaRects.length,
    distance: Math.min(...areaRects.flatMap((rect) => samples.map(([x, z]) => gapToBounds(x, z, rect)))),
  };
};

describe('authored fixed loot', () => {
  it('delivers fixed loot without replacing seed filler and is chunk-order independent', () => {
    expect(result.issues).toEqual([]);
    const fixture = compactFixture();
    const site = new AuthoredSite(73, result.registry, scale, fixture);
    const columns = columnsFor(site, fixture);
    const forward = furnishInOrder(site, columns);
    const reverse = furnishInOrder(site, [...columns].reverse());
    const overrides = placedOverrides(fixture);
    expect(overrides.length).toBeGreaterThan(0);
    const crowbar = overrides.flatMap(({ override }) => override.items).find(({ item }) => item === 'crowbar');
    expect(crowbar?.condition).toBeGreaterThan(0);
    expect(crowbar?.condition).toBeLessThan(1);
    expect(result.registry.items.get('shotshell_box')?.unpack).toMatchObject({
      item: 'shell_12_gauge_00_buck',
      count: 20,
    });
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
    expect(contents(forward)).toEqual(contents(reverse));
  });

  it('places each beat’s key loot in its agreed buildings and containers', () => {
    const overrides = placedOverrides(layout);
    const templates = new Set(layout.buildings.map(({ template }) => template));
    for (const template of ['small_house', 'bungalow', 'corner_store', 'gas_station', 'shed']) {
      expect(templates.has(template), template).toBe(true);
    }
    expect(templates.has('hardware_store')).toBe(false);
    const house = overrides.filter(({ building }) => building.template === 'playtest_house');
    const beans = overrideFor(house, 'playtest_house', 'canned_beans');
    const opener = overrideFor(house, 'playtest_house', 'can_opener');
    const flashlight = overrideFor(house, 'playtest_house', 'flashlight');
    const battery = overrideFor(house, 'playtest_house', 'aa_battery');
    expect(beans).toBeDefined();
    expect(opener).toBeDefined();
    expect(opener).not.toBe(beans);
    expect(flashlight).toBeDefined();
    expect(battery).toBeDefined();
    expect(battery).not.toBe(flashlight);

    const houseCounts = new Map<string, number>();
    for (const { override } of house) {
      for (const fixed of override.items) {
        houseCounts.set(fixed.item, (houseCounts.get(fixed.item) ?? 0) + (fixed.count ?? 1));
      }
    }
    const torch = result.registry.recipes.get('torch');
    expect(torch).toBeDefined();
    for (const alternatives of torch!.components) {
      expect(alternatives.some((ingredient) => (houseCounts.get(ingredient.item) ?? 0) >= ingredient.count)).toBe(true);
    }

    expect(fixedCount(overrides, 'shed', 'crowbar')).toBeGreaterThan(0);
    expect(
      overrides
        .filter(({ building }) => ['playtest_tool_shack', 'shed'].includes(building.template))
        .flatMap(({ override }) => override.items)
        .some(({ item }) => item === 'hammer' || item === 'duct_tape'),
    ).toBe(false);
    const toolShack = result.registry.templates.get('playtest_tool_shack')!;
    const toolShackCrate = compileTemplate(result.registry, toolShack).pieces.find(
      (piece) => piece.furniture === 'crate',
    );
    expect(toolShackCrate?.loot).toBe('d41_empty');
    expect(fixedCount(overrides, 'bungalow', 'home_repair_book')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'bungalow', 'rag')).toBeGreaterThanOrEqual(2);
    expect(fixedCount(overrides, 'bungalow', 'wax')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'bungalow', 'jacket')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'gas_station', 'scrap_metal')).toBeGreaterThan(0);
    const scrap = overrideFor(overrides, 'gas_station', 'scrap_metal');
    expect(scrap).toBeDefined();
    expect(furnitureAt(scrap!)).toBe('crate');
    expect(fixedCount(overrides, 'corner_store', 'duct_tape')).toBeGreaterThan(0);
    for (const item of ['canned_soup', 'crackers', 'soda_can', 'painkillers', 'bandage']) {
      expect(fixedCount(overrides, 'corner_store', item), item).toBeGreaterThan(0);
    }
    const medicine = overrideFor(overrides, 'corner_store', 'painkillers');
    expect(medicine).toBeDefined();
    expect(furnitureAt(medicine!)).toBe('kitchen_cupboard');
    const kiosk = overrideFor(overrides, 'gas_station', 'portable_radio');
    const radio = kiosk?.override.items.find(({ item }) => item === 'portable_radio');
    expect(radio?.condition).toBeLessThan(1);
    expect(kiosk?.override.items.some(({ item }) => item === 'compass')).toBe(true);
    expect(furnitureAt(kiosk!)).toBe('counter');
    expect(fixedCount(overrides, 'gas_station', 'compass')).toBeGreaterThan(0);

    const cellar = overrideFor(overrides, 'playtest_dads_cabin', 'shotshell_box');
    const cabin = result.registry.templates.get('playtest_dads_cabin');
    expect(cellar).toBeDefined();
    expect(cellar!.override.at[1]).toBe(cabin?.access?.storeys.find(({ id }) => id === 'cellar')?.floor);
    expect(fixedCount(overrides, 'playtest_dads_cabin', 'pump_shotgun')).toBeGreaterThan(0);
  });

  it('places the agreed shambler threats by beat and keeps the seeded wanderer', () => {
    const houseTemplate = result.registry.templates.get('playtest_house')!;
    const bedroomFloor = houseTemplate.access?.storeys.find(({ id }) => id === 'bedroom')?.floor;
    const upstairs = compileTemplate(result.registry, houseTemplate).spawns;
    expect(upstairs).toHaveLength(1);
    expect(upstairs[0]?.pos[1]).toBe(bedroomFloor);

    for (const templateId of ['playtest_tool_shack', 'shed']) {
      const template = result.registry.templates.get(templateId)!;
      const { spawns } = compileTemplate(result.registry, template);
      expect(spawns.some(({ zombie, chance }) => zombie === 'shambler' && chance < 1)).toBe(true);
    }

    const inside = (templateId: string, spawn: SiteLayoutDef['shamblers'][number]): boolean => {
      const building = layout.buildings.find(({ template }) => template === templateId)!;
      const rect = buildingBounds(building, result.registry.templates.get(templateId)!.size);
      return (
        spawn.position[0] >= rect.x0 &&
        spawn.position[0] <= rect.x1 &&
        spawn.position[2] >= rect.z0 &&
        spawn.position[2] <= rect.z1
      );
    };
    const storeThreats = layout.shamblers.filter((spawn) => spawn.type === 'shambler' && inside('corner_store', spawn));
    const garageThreats = layout.shamblers.filter((spawn) => spawn.type === 'shambler' && inside('gas_station', spawn));
    expect(storeThreats).toHaveLength(1);
    expect(garageThreats).toHaveLength(1);

    const isInsideWoodland = (x: number, z: number, polygon: Point[]): boolean => {
      let contains = false;
      for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
        const [xi, zi] = polygon[index]!;
        const [xj, zj] = polygon[previous]!;
        const crossesZ = zi > z !== zj > z;
        if (crossesZ && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
          contains = !contains;
        }
      }
      return contains;
    };
    const treelineThreats = layout.shamblers.filter(
      ({ type, position }) =>
        type === 'shambler' &&
        layout.woodlands.some(({ polygon }) => isInsideWoodland(position[0], position[2], polygon)),
    );
    expect(treelineThreats.length).toBeGreaterThanOrEqual(1);
    expect(treelineThreats.length).toBeLessThanOrEqual(2);
    const track = layout.tracks[0]!;
    const roadsideThreats = layout.shamblers.filter(
      (spawn) =>
        spawn.type === 'shambler' &&
        !treelineThreats.includes(spawn) &&
        polylineDistance([spawn.position[0], spawn.position[2]], track.points) <= track.width * 2,
    );
    expect(roadsideThreats).toHaveLength(2);
    expect(layout.startTime).toBe('16:00');
  });

  it('keeps the authored route near progression areas, clear of buildings and walkable over terrain', () => {
    expect(result.issues).toEqual([]);
    const fixture = compactFixture();
    const site = new AuthoredSite(73, result.registry, scale, fixture);
    const rects = fixture.buildings.map((building) =>
      buildingBounds(building, result.registry.templates.get(building.template)!.size),
    );
    const track = fixture.tracks[0]!;
    const route = sampleRoute(site, fixture, rects);
    expect(route.samples.length).toBeGreaterThan(0);
    expect(route.minBuildingClearance).toBeGreaterThanOrEqual(track.width / 2);
    expect(route.maxHeightStep).toBeLessThanOrEqual(1);
    expect(route.allOnTrackSurface).toBe(true);
    expect(
      polylineDistance([fixture.player.position[0], fixture.player.position[2]], track.points),
    ).toBeLessThanOrEqual(track.width / 2);
    const nearHouse = nearestAreaDistance(fixture, rects, route.samples, ['playtest_house']);
    expect(nearHouse.count).toBeGreaterThan(0);
    expect(nearHouse.distance).toBeLessThanOrEqual(track.width * 2);
    const nearStores = nearestAreaDistance(fixture, rects, route.samples, [
      'bungalow',
      'corner_store',
      'small_house',
      'gas_station',
      'shed',
    ]);
    expect(nearStores.count).toBeGreaterThan(0);
    expect(nearStores.distance).toBeLessThanOrEqual(track.width * 2);
    const nearCabins = nearestAreaDistance(fixture, rects, route.samples, [
      'playtest_dads_cabin',
      'playtest_hunter_cabin',
      'woodshed',
    ]);
    expect(nearCabins.count).toBeGreaterThan(0);
    expect(nearCabins.distance).toBeLessThanOrEqual(track.width * 2);
    const doorSolids = storefrontDoorSolids(result.registry);
    expect(doorSolids.length).toBeGreaterThan(0);
    expect(doorSolids.every(Boolean)).toBe(true);
  });
});
