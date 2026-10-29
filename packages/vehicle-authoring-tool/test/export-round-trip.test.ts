import { describe, expect, it } from 'vitest';
import inventory from '../../deadvox/src/content/base/inventory.json' with { type: 'json' };
import battery from '../../deadvox/src/content/base/things/car_battery.model.json' with { type: 'json' };
import { buildRegistry, type ContentSource } from '../../deadvox/src/core/content.ts';
import { loadVehicleBlueprint, vehicleContentIssues } from '../../deadvox/src/core/vehicleBlueprint.ts';
import { exportVehicleBlueprint, type VehicleBlueprintInput } from '../src/export.ts';

type Blueprint =
  ReturnType<typeof buildRegistry>['registry']['vehicleBlueprints'] extends Map<string, infer Value> ? Value : never;

const PART = 'vat_round_trip_part';
const HOST = 'vat_round_trip_host';

const input: VehicleBlueprintInput = {
  id: HOST,
  name: 'VAT round-trip host',
  fittings: [{ id: 'structure', part: PART, at: [0, 0, 0], supportedBy: [] }],
};

const sourceFor = (blueprint: VehicleBlueprintInput): ContentSource => ({
  source: 'vat/round-trip.json',
  data: {
    models: [{ ...battery, id: PART }],
    items: [
      {
        id: PART,
        name: 'VAT round-trip part',
        workInProgress: false,
        notLoot: false,
        category: 'misc',
        model: PART,
        size: [1, 1],
        economy: { usage: [], tiers: [] },
        vehicle: {
          capabilities: ['structure'],
          obstruction: { sight: true, light: true, sound: true, combat: true },
        },
      },
    ],
    ...exportVehicleBlueprint(blueprint),
  },
});

describe('vehicle blueprint export', () => {
  it('round-trips through Deadvox content validation and loading', () => {
    const exported = exportVehicleBlueprint(input);
    expect(exported).toEqual({ vehicleBlueprints: [input] });

    const { issues, registry } = buildRegistry([{ source: 'inventory.json', data: inventory }, sourceFor(input)]);
    expect(issues).toEqual([]);
    expect(vehicleContentIssues(registry)).toEqual([]);
    expect(registry.vehicleBlueprints.get(HOST)).toMatchObject(exported.vehicleBlueprints[0]!);
    expect(loadVehicleBlueprint(registry, HOST).fittings).toHaveLength(1);
  });

  it('leaves malformed output for Deadvox vehicleContentIssues to report', () => {
    const { issues, registry } = buildRegistry([{ source: 'inventory.json', data: inventory }, sourceFor(input)]);
    expect(issues).toEqual([]);

    const malformed = exportVehicleBlueprint({
      ...input,
      id: 'vat_malformed_host',
      fittings: [{ ...input.fittings[0]!, part: 'vat_missing_part' }],
    });
    const vehicleBlueprints = new Map(registry.vehicleBlueprints);
    vehicleBlueprints.set('vat_malformed_host', malformed.vehicleBlueprints[0]! as Blueprint);

    expect(vehicleContentIssues({ ...registry, vehicleBlueprints })).toContainEqual({
      section: 'vehicleBlueprints',
      id: 'vat_malformed_host',
      path: '.fittings[0].part',
      message: 'no item "vat_missing_part"',
    });
  });
});
