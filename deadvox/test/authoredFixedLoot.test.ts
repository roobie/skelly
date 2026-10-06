import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildingBounds, polylineDistance } from '../src/core/authoredTerrain.mjs';
import { SPAWN_TIMES } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { toChunk } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { rollLoot } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { type CompiledTemplate, compileTemplate, footprint, placedPieces } from '../src/core/templates.ts';

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

const partitionRowBefore = (template: CompiledTemplate, targetZ: number): number => {
  const [sx, , sz] = template.size;
  const blockedAt = (x: number, z: number): boolean => {
    const block = template.blocks[x + sx * (z + sz)];
    if (result.registry.blocks[block!]?.solid) {
      return true;
    }
    return template.pieces.some((piece) => {
      const def = result.registry.furniture.get(piece.furniture)!;
      return (
        !def.door &&
        def.solid !== false &&
        x >= piece.pos[0] &&
        x < piece.pos[0] + piece.size[0] &&
        piece.pos[1] <= 1 &&
        piece.pos[1] + piece.size[1] > 1 &&
        z >= piece.pos[2] &&
        z < piece.pos[2] + piece.size[2]
      );
    });
  };
  const rows = Array.from({ length: Math.min(targetZ, sz) - 1 }, (_, index) => index + 1);
  const partitions = rows.filter((z) => {
    const cells = Array.from({ length: sx }, (_, x) => blockedAt(x, z));
    let opening = 0;
    let widestOpening = 0;
    for (const blocked of cells) {
      opening = blocked ? 0 : opening + 1;
      widestOpening = Math.max(widestOpening, opening);
    }
    return cells.filter(Boolean).length > sx / 2 && widestOpening >= 2;
  });
  const partition = Math.max(...partitions);
  if (!Number.isFinite(partition)) {
    throw new Error(`${template.id} fixed loot has no room partition before z=${targetZ}`);
  }
  return partition;
};

const insideTemplate = (template: CompiledTemplate, x: number, y: number, z: number): boolean => {
  const [sx, sy, sz] = template.size;
  return x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz;
};

const solidPieceAt = (template: CompiledTemplate, x: number, y: number, z: number): boolean =>
  template.pieces.some((piece) => {
    const def = result.registry.furniture.get(piece.furniture)!;
    return (
      def.solid !== false &&
      x >= piece.pos[0] &&
      x < piece.pos[0] + piece.size[0] &&
      y >= piece.pos[1] &&
      y < piece.pos[1] + piece.size[1] &&
      z >= piece.pos[2] &&
      z < piece.pos[2] + piece.size[2]
    );
  });

const solidCellAt = (template: CompiledTemplate, x: number, y: number, z: number): boolean => {
  const [sx, , sz] = template.size;
  const block = template.blocks[x + sx * (z + sz * y)]!;
  return result.registry.blocks[block]?.solid === true || solidPieceAt(template, x, y, z);
};

const bodyClearOfSolids = (template: CompiledTemplate, [x, feet, z]: readonly [number, number, number]): boolean => {
  for (let y = Math.floor(feet); y < Math.ceil(feet + STAIR_BODY_HEIGHT); y += 1) {
    for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz += 1) {
      for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx += 1) {
        if (!insideTemplate(template, bx, y, bz) || solidCellAt(template, bx, y, bz)) {
          return false;
        }
      }
    }
  }
  return true;
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
    for (const template of ['small_house', 'bungalow', 'playtest_store', 'playtest_gas_station', 'shed']) {
      expect(templates.has(template), template).toBe(true);
    }
    expect(templates.has('hardware_store')).toBe(false);
    const house = overrides.filter(({ building }) => building.template === 'playtest_house');
    const beans = overrideFor(house, 'playtest_house', 'canned_beans');
    const opener = overrideFor(house, 'playtest_house', 'can_opener');
    const flashlight = overrideFor(house, 'playtest_house', 'flashlight');
    const battery = overrideFor(house, 'playtest_house', 'aa_battery');
    const matches = overrideFor(house, 'playtest_house', 'matches');
    expect(beans).toBeDefined();
    expect(opener).toBeDefined();
    expect(opener).not.toBe(beans);
    expect(flashlight).toBeDefined();
    expect(battery).toBeDefined();
    expect(battery).not.toBe(flashlight);
    expect(matches).toBeDefined();
    expect(matches).not.toBe(flashlight);

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
    expect(fixedCount(overrides, 'playtest_gas_station', 'scrap_metal')).toBeGreaterThan(0);
    const scrap = overrideFor(overrides, 'playtest_gas_station', 'scrap_metal');
    expect(scrap).toBeDefined();
    expect(furnitureAt(scrap!)).toBe('crate');
    expect(fixedCount(overrides, 'playtest_store', 'duct_tape')).toBeGreaterThan(0);
    for (const item of ['canned_soup', 'crackers', 'soda_can', 'painkillers', 'bandage']) {
      expect(fixedCount(overrides, 'playtest_store', item), item).toBeGreaterThan(0);
    }
    const medicine = overrideFor(overrides, 'playtest_store', 'painkillers');
    expect(medicine).toBeDefined();
    expect(furnitureAt(medicine!)).toBe('kitchen_cupboard');
    const kiosk = overrideFor(overrides, 'playtest_gas_station', 'portable_radio');
    const radio = kiosk?.override.items.find(({ item }) => item === 'portable_radio');
    expect(radio?.condition).toBeLessThan(1);
    expect(kiosk?.override.items.some(({ item }) => item === 'compass')).toBe(true);
    expect(furnitureAt(kiosk!)).toBe('counter');
    expect(fixedCount(overrides, 'playtest_gas_station', 'compass')).toBeGreaterThan(0);

    const cellar = overrideFor(overrides, 'playtest_dads_cabin', 'shotshell_box');
    const cabin = result.registry.templates.get('playtest_dads_cabin');
    expect(cellar).toBeDefined();
    expect(cellar!.override.at[1]).toBe(cabin?.access?.storeys.find(({ id }) => id === 'cellar')?.floor);
    expect(fixedCount(overrides, 'playtest_dads_cabin', 'pump_shotgun')).toBeGreaterThan(0);
  });

  it('keeps every fixed-loot container reachable from outside at standing height', () => {
    const buildings = layout.buildings.filter((building) => (building.fixedLoot?.length ?? 0) > 0);
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
    const storeThreats = layout.shamblers.filter(
      (spawn) => spawn.type === 'shambler' && inside('playtest_store', spawn),
    );
    const garageThreats = layout.shamblers.filter(
      (spawn) => spawn.type === 'shambler' && inside('playtest_gas_station', spawn),
    );
    expect(storeThreats).toHaveLength(1);
    expect(garageThreats).toHaveLength(1);
    for (const [templateId, item, spawn] of [
      ['playtest_store', 'duct_tape', storeThreats[0]!],
      ['playtest_gas_station', 'scrap_metal', garageThreats[0]!],
    ] as const) {
      const building = layout.buildings.find(({ template }) => template === templateId)!;
      const buildingTemplate = compileTemplate(result.registry, result.registry.templates.get(templateId)!);
      const container = overrideFor(placedOverrides(layout), templateId, item)!;
      const partition = partitionRowBefore(buildingTemplate, container.override.at[2]);
      const walking = withTestEntrance(buildingTemplate, container.override.at);
      expect(templateSpatialIssues(result.registry, walking), templateId).toEqual([]);
      const reachable = templateReachableStandingPositions(result.registry, walking);
      const local: [number, number, number] = spawn.position.map(
        (coordinate, axis) => (coordinate - building.position[axis]!) / scale.blockSize,
      ) as [number, number, number];
      expect(reachable, `${templateId} threat at ${local.join(',')} is reachable at standing height`).toContainEqual(
        local,
      );
      expect(bodyClearOfSolids(buildingTemplate, local), `${templateId} threat body is clear of closed solids`).toBe(
        true,
      );
      expect(
        local[2] - STAIR_BODY_HALF_WIDTH,
        `${templateId} threat stands beyond partition ${partition}`,
      ).toBeGreaterThanOrEqual(partition + 1);
      expect(local[2] + STAIR_BODY_HALF_WIDTH).toBeLessThan(buildingTemplate.size[2]);
    }

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
    const parsedLayout = result.registry.layouts.get(layout.id)!;
    const parsedThreats = parsedLayout.shamblers;
    const parsedRoadsideThreats = parsedThreats.filter(
      (spawn) =>
        spawn.type === 'shambler' &&
        !treelineThreats.some(({ position }) => position.every((coordinate, axis) => coordinate === spawn.position[axis])) &&
        polylineDistance([spawn.position[0], spawn.position[2]], track.points) <= track.width * 2,
    );
    const parsedTreelineThreats = parsedThreats.filter(({ position }) =>
      treelineThreats.some((spawn) => position.every((coordinate, axis) => coordinate === spawn.position[axis])),
    );
    const hasDuskWindow = (spawn: SiteLayoutDef['shamblers'][number]) =>
      spawn.window?.fromGameTimeOfDay === SPAWN_TIMES.dusk;
    expect(parsedRoadsideThreats.filter(hasDuskWindow)).toHaveLength(1);
    expect(parsedTreelineThreats.filter(hasDuskWindow)).toHaveLength(1);
    expect(parsedLayout.startTimeGameTimeOfDay).toBe(16 * 3_600);
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
      'playtest_store',
      'small_house',
      'playtest_gas_station',
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
  });
});
