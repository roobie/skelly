import type { ModelBox } from '@skelly/thing-core/schema';
import { describe, expect, it } from 'vitest';
import { cargoFitting, cargoSpaceItem, fitIssue, freeFloor } from '../src/core/cargoSpace.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { ItemFactory, type ItemState, restoreItem, snapshotItem } from '../src/core/items.ts';
import type { VehicleFittingDef } from '../src/core/schema.ts';
import { loadVehicleBlueprint, type PlacedFitting, placeFitting } from '../src/core/vehicleBlueprint.ts';
import { baseSources } from '../src/game/bundledContent.ts';

// The vehicle content and the cell size it is measured in, not the whole base: see `test/vehicleExport.test.ts`.
const FIXTURE_BASE = ['vehicles.json', 'models-items.json', 'inventory.json'];
const fixtureSources = baseSources.filter(({ source }) => FIXTURE_BASE.some((file) => source.endsWith(`/${file}`)));
const MOD = 'mods/cargo-fixture.json';
const OFF_FREE_FLOOR = /free floor/;
const ABOVE_CLEARANCE = /clearance/;
const INSIDE_HOLD = /inside cargo space box_cargo/;
const NO_LOAD_FLOOR = /load floor/;

const base = buildRegistry(fixtureSources);
const { registry } = base;
const cell = registry.inventory.get(CORE_CONTENT_IDS.player)!.cellMetres;
const openMetres = registry.items.get('cargo_space')!.vehicle!.cargoSpace!.openClearanceCells * cell;

const fittingsOf = (host: string): readonly PlacedFitting[] => loadVehicleBlueprint(registry, host).fittings;
const defOf = (host: string, id: string): VehicleFittingDef =>
  registry.vehicleBlueprints.get(host)!.fittings.find((fitting) => fitting.id === id)!;
const without = (fittings: readonly PlacedFitting[], ...ids: string[]) =>
  fittings.filter(({ id }) => !ids.includes(id));
const loadFloorOf = (fittings: readonly PlacedFitting[]): PlacedFitting =>
  fittings.find(({ capabilities }) => capabilities.includes('load_floor'))!;

/** A cell's plan in vehicle metres, from its `cellKey`. */
const cellPlan = (key: string): ModelBox => {
  const [i, k] = key.split(',').map(Number) as [number, number];
  return { min: [i * cell, 0, k * cell], max: [(i + 1) * cell, 0, (k + 1) * cell] };
};
const tolerance = 1e-6;
const planInside = (inner: ModelBox, outer: ModelBox): boolean =>
  [0, 2].every(
    (axis) => inner.min[axis]! >= outer.min[axis]! - tolerance && inner.max[axis]! <= outer.max[axis]! + tolerance,
  );
const planOverlaps = (a: ModelBox, b: ModelBox): boolean =>
  [0, 2].every((axis) => a.min[axis]! < b.max[axis]! - tolerance && b.min[axis]! < a.max[axis]! - tolerance);

/** A cargo space one cell across on cell `key` of `floor`, `height` cells tall. */
const probe = (floor: string, top: number, key: string, height = 1): PlacedFitting => {
  const { min } = cellPlan(key);
  return placeFitting(registry, {
    id: 'probe',
    part: 'cargo_space',
    at: [min[0] + cell / 2, top, min[2] + cell / 2],
    supportedBy: [floor],
    cargo: [1, height, 1],
  });
};

describe('cargo space', () => {
  it('loads factory cargo spaces with no content issues', () => {
    expect(base.issues).toEqual([]);
    expect(['pickup', 'box_van'].every((host) => fittingsOf(host).some(({ cargo }) => cargo))).toBe(true);
  });

  it('keeps the free floor inside a bare load floor’s own edges', () => {
    for (const host of ['pickup', 'box_van']) {
      const floor = loadFloorOf(fittingsOf(host));
      const free = freeFloor([floor], floor.id, cell, openMetres)!;
      expect(free.clearance.size).toBeGreaterThan(0);
      for (const key of free.clearance.keys()) {
        expect(floor.collision.some((box) => planInside(cellPlan(key), box))).toBe(true);
      }
    }
  });

  it('takes out the floor under the pickup’s wheel tubs', () => {
    const fittings = without(fittingsOf('pickup'), 'bed_cargo');
    const floor = loadFloorOf(fittings);
    const free = freeFloor(fittings, floor.id, cell, openMetres)!;
    const tubs = fittings
      .filter(({ id }) => id.startsWith('bed_side'))
      .flatMap(({ collision }) => collision)
      .filter((box) => box.min[1] < free.top && box.max[1] > free.top)
      .filter((box) => floor.collision.some((face) => planOverlaps(box, face)));
    expect(tubs.length).toBeGreaterThan(0);
    expect(free.clearance.size).toBeGreaterThan(0);
    for (const key of free.clearance.keys()) {
      expect(tubs.some((tub) => planOverlaps(cellPlan(key), tub))).toBe(false);
    }
  });

  it('gives two cargo spaces of one footprint and different heights equal grids', () => {
    const factory = defOf('box_van', 'box_cargo');
    const [x, y, z] = factory.cargo!;
    const low = placeFitting(registry, { ...factory, cargo: [x, 1, z] });
    const high = placeFitting(registry, { ...factory, cargo: [x, y, z] });
    expect(y).toBeGreaterThan(1);
    expect(high.cargo!.grid).toEqual(low.cargo!.grid);
  });

  it('refuses a cargo space outside the free floor or above its clearance', () => {
    const present = without(fittingsOf('box_van'), 'box_cargo');
    const floor = loadFloorOf(present);
    const free = freeFloor(present, floor.id, cell, openMetres)!;
    const [key, clearance] = [...free.clearance].find(([at]) => {
      const [i, k] = at.split(',').map(Number) as [number, number];
      return !free.clearance.has(`${i + 1},${k}`);
    })!;
    const [i, k] = key.split(',').map(Number) as [number, number];
    expect(fitIssue(present, probe(floor.id, free.top, key), cell)).toBeUndefined();
    expect(fitIssue(present, probe(floor.id, free.top, `${i + 1},${k}`), cell)).toMatch(OFF_FREE_FLOOR);
    const tooTall = Math.ceil(clearance / cell) + 1;
    expect(fitIssue(present, probe(floor.id, free.top, key, tooTall), cell)).toMatch(ABOVE_CLEARANCE);
  });

  describe('refuses overlap both ways', () => {
    const fittings = fittingsOf('box_van');
    const hold = defOf('box_van', 'box_cargo');
    const battery = (at: readonly [number, number, number]) =>
      placeFitting(registry, { id: 'battery', part: 'car_battery', at: [...at], supportedBy: ['box_floor'] });
    const inside = battery(hold.at);

    it('refuses a part fitted into a fitted cargo space', () => {
      const above = battery([
        hold.at[0],
        Math.max(...fittings.flatMap(({ collision }) => collision.map(({ max }) => max[1]))),
        hold.at[2],
      ]);
      expect(fitIssue(fittings, above, cell)).toBeUndefined();
      expect(fitIssue(fittings, inside, cell)).toMatch(INSIDE_HOLD);
    });

    it('refuses a cargo space fitted through a part', () => {
      const present = without(fittings, 'box_cargo');
      const cargo = fittings.find(({ id }) => id === 'box_cargo')!;
      expect(fitIssue(present, cargo, cell)).toBeUndefined();
      expect(fitIssue([...present, inside], cargo, cell)).toMatch(OFF_FREE_FLOOR);
    });
  });

  it('keeps a fitted cargo space valid when a wall beside it comes off', () => {
    const fittings = fittingsOf('pickup');
    const hold = fittings.find(({ cargo }) => cargo)!;
    const wall = fittings.find(({ id }) => id.startsWith('bed_side'))!;
    expect(fitIssue(without(fittings, hold.id, wall.id), hold, cell)).toBeUndefined();
  });

  it('keeps a filled cargo space’s size and contents through save, salvage and refitting', () => {
    const factory = new ItemFactory();
    const fitted = defOf('box_van', 'box_cargo');
    const salvaged = cargoSpaceItem(factory, registry, fitted.part, fitted.cargo!);
    salvaged.pockets![0]!.push({ item: factory.create(registry, 'car_battery'), x: 0, y: 0, rotated: false });
    const saved = JSON.parse(JSON.stringify(snapshotItem(salvaged))) as ItemState;
    const restored = restoreItem(registry, saved);
    expect(restored.cargo).toEqual(fitted.cargo);
    expect(restored.pockets).toEqual(salvaged.pockets);
    const refitted = placeFitting(registry, cargoFitting(restored, fitted));
    expect(refitted.cargo).toEqual(placeFitting(registry, fitted).cargo);
    expect(fitIssue(without(fittingsOf('box_van'), fitted.id), refitted, cell)).toBeUndefined();
  });

  it('refuses a cargo space resting on a part that is not a load floor', () => {
    const cart = (support: string) => ({
      vehicleBlueprints: [
        {
          id: 'fixture_cart',
          name: 'Cart',
          fittings: [
            { ...defOf('box_van', 'box_floor'), id: 'base', part: support },
            { ...defOf('box_van', 'box_cargo'), supportedBy: ['base'] },
          ],
        },
      ],
    });
    const withMod = (data: object) => buildRegistry([...fixtureSources, { source: MOD, data } satisfies ContentSource]);
    expect(withMod(cart('box_van_floor')).issues).toEqual([]);
    const refused = withMod(cart('box_van_side'));
    expect(
      refused.issues.some(({ path, message }) => path.endsWith('.fittings[1]') && NO_LOAD_FLOOR.test(message)),
    ).toBe(true);
    expect(refused.registry.vehicleBlueprints.has('fixture_cart')).toBe(false);
  });
});
