import { modelMassKg } from '@skelly/thing-core/mass';
import { describe, expect, it } from 'vitest';
import battery from '../src/content/base/things/car_battery.model.json' with { type: 'json' };
import { buildRegistry, type ContentSource, type Registry } from '../src/core/content.ts';
import { loadVehicleBlueprint, type PlacedFitting } from '../src/core/vehicleBlueprint.ts';
import { baseSources } from '../src/game/bundledContent.ts';
import { PLAYER } from '../src/game/player.ts';

const HOSTS = ['hatchback', 'pickup', 'hoist'];
const MOD = 'mods/vehicle-fixture.json';

// A mod case needs the vehicle content it refers to, not the whole base: a full rebuild per case grows with every
// content file and times out on loaded runners. Cargo spaces are measured in the inventory's cell size.
const FIXTURE_BASE = ['vehicles.json', 'models-items.json', 'inventory.json'];
const fixtureSources = baseSources.filter(({ source }) => FIXTURE_BASE.some((file) => source.endsWith(`/${file}`)));

const withMod = (data: object) => buildRegistry([...fixtureSources, { source: MOD, data } satisfies ContentSource]);

const modPart = (
  id: string,
  capabilities: readonly string[],
  model: object = { ...battery, id },
  ratedLoadKg?: number,
) => ({
  models: [model],
  items: [
    {
      id,
      name: 'Fixture part',
      workInProgress: false,
      notLoot: false,
      category: 'misc',
      model: id,
      size: [3, 2],
      economy: { usage: [], tiers: [] },
      vehicle: { capabilities, ...(ratedLoadKg === undefined ? {} : { ratedLoadKg }) },
    },
  ],
});

const fitting = (id: string, part: string, supportedBy: string[] = []) => ({ id, part, at: [0, 0, 0], supportedBy });
const blueprint = (...fittings: object[]) => ({ vehicleBlueprints: [{ id: 'fixture_cart', name: 'Cart', fittings }] });

const fittingOf = (registry: Registry, host: string, id: string): PlacedFitting =>
  loadVehicleBlueprint(registry, host).fittings.find((placed) => placed.id === id)!;

describe('vehicle export contract', () => {
  const base = buildRegistry(baseSources);

  it('loads each host from exported parts, with each part mass and collision from its export', () => {
    expect(base.issues).toEqual([]);
    const parts = HOSTS.map((host) => {
      const vehicle = loadVehicleBlueprint(base.registry, host);
      for (const placed of vehicle.fittings) {
        const model = base.registry.models.get(base.registry.items.get(placed.part)!.model!)!;
        expect(placed.massKg).toBe(modelMassKg({ parts: model.parts! }));
        expect(placed.collision.length).toBeGreaterThan(0);
      }
      expect(vehicle.massKg).toBeCloseTo(vehicle.fittings.reduce((sum, { massKg }) => sum + massKg, 0));
      return new Set(vehicle.fittings.map(({ part }) => part));
    });
    expect([...parts[0]!].some((part) => parts[1]!.has(part))).toBe(true);
  });

  it('loads a mod-authored part and blueprint with no code edit', () => {
    const { issues, registry } = withMod({
      ...modPart('fixture_cell', ['electricity']),
      ...blueprint(fitting('tray', 'hatchback_battery_tray'), fitting('cell', 'fixture_cell', ['tray'])),
    });
    expect(issues).toEqual([]);
    expect(fittingOf(registry, 'fixture_cart', 'cell').capabilities).toEqual(['electricity']);
  });

  const bare = { ...battery, id: 'fixture_cell', parts: { body: { massKg: 1, centreOfMass: [0, 0, 0] } } };
  // Each row names the path its issue must point at, so a refusal can't pass for another reason.
  const refusals: [string, object, string][] = [
    ['an unsupported capability', modPart('fixture_cell', ['teleport']), '.vehicle.capabilities[0]'],
    ['a part without baked collision', modPart('fixture_cell', [], bare), 'items[0].model'],
    ['a fitting naming no item', blueprint(fitting('cell', 'fixture_missing')), '.fittings[0].part'],
    [
      'a fitting naming an item that is not a vehicle part',
      {
        models: [{ ...battery, id: 'fixture_plain' }],
        items: [
          {
            id: 'fixture_plain',
            workInProgress: false,
            notLoot: false,
            name: 'Fixture plain item',
            category: 'misc',
            model: 'fixture_plain',
            size: [1, 1],
            economy: { usage: [], tiers: [] },
          },
        ],
        ...blueprint(fitting('cell', 'fixture_plain')),
      },
      '.fittings[0].part',
    ],
    [
      'a fitting resting on an absent support',
      blueprint(fitting('cell', 'car_battery', ['tray'])),
      'vehicleBlueprints[0].fittings',
    ],
    [
      'a support cycle',
      blueprint(fitting('a', 'car_battery', ['b']), fitting('b', 'hatchback_battery_tray', ['a'])),
      'vehicleBlueprints[0].fittings',
    ],
    ['a lifting part without a rated load', modPart('fixture_cell', ['lift']), 'items[0].vehicle'],
    [
      'a rated load on a part that does not lift',
      modPart('fixture_cell', ['structure'], undefined, 500),
      'items[0].vehicle',
    ],
    [
      'a lifting vehicle without stabilisers',
      { ...modPart('fixture_cell', ['lift'], undefined, 500), ...blueprint(fitting('crane', 'fixture_cell')) },
      'vehicleBlueprints[0].fittings',
    ],
  ];
  it.each(refusals)('refuses %s and drops the file that authors it', (_, data, path) => {
    const { issues, registry } = withMod(data);
    expect(issues.map((issue) => issue.path).some((at) => at.endsWith(path))).toBe(true);
    expect(issues.every(({ source }) => source === MOD)).toBe(true);
    expect(registry.vehicleBlueprints.has('fixture_cart')).toBe(false);
    expect(registry.items.has('fixture_cell')).toBe(false);
  });

  it('gives every vehicle with a seat a way in at least as wide as the player', () => {
    const seated = [...base.registry.vehicleBlueprints.keys()]
      .map((id) => loadVehicleBlueprint(base.registry, id))
      .filter(({ fittings }) => fittings.some(({ capabilities }) => capabilities.includes('seat')));
    expect(seated.map(({ id }) => id)).toContain(HOSTS[0]);
    for (const { fittings } of seated) {
      const entries = fittings.filter(({ capabilities }) => capabilities.includes('entry'));
      expect(entries.length).toBeGreaterThan(0);
      for (const { collision } of entries) {
        const span = (axis: 0 | 2) =>
          Math.max(...collision.map(({ max }) => max[axis])) - Math.min(...collision.map(({ min }) => min[axis]));
        expect(Math.max(span(0), span(2))).toBeGreaterThanOrEqual(2 * PLAYER.halfWidth);
      }
    }
  });

  it('reflects a mirrored fitting’s datums, collision and centre of mass with its geometry', () => {
    const near = fittingOf(base.registry, 'hatchback', 'headlamp_near');
    const far = fittingOf(base.registry, 'hatchback', 'headlamp_far');
    const reflect = ([x, y, z]: readonly number[]) => [x, y, -z!];
    const datums = Object.keys(near.datums);
    expect(datums.some((id) => near.datums[id]![2] !== -near.datums[id]![2])).toBe(true);
    for (const id of datums) {
      expect(far.datums[id]).toEqual(reflect(near.datums[id]!));
    }
    expect(far.centreOfMass).toEqual(reflect(near.centreOfMass));
    expect(far.collision).toEqual(
      near.collision.map(({ min, max }) => ({
        min: reflect([min[0], min[1], max[2]]),
        max: reflect([max[0], max[1], min[2]]),
      })),
    );
    for (const placed of [near, far]) {
      for (const point of Object.values(placed.datums)) {
        const inside = placed.collision.some(({ min, max }) =>
          point.every((v, axis) => v >= min[axis]! - 1e-9 && v <= max[axis]! + 1e-9),
        );
        expect(inside).toBe(true);
      }
    }
  });
});
