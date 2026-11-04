import { describe, expect, it } from 'vitest';
import inventory from '../../deadvox/mods/skelly.deadvox.residual/inventory.json' with { type: 'json' };
import battery from '../../deadvox/mods/skelly.deadvox.residual/things/car_battery.model.json' with { type: 'json' };
import { buildRegistry, type ContentSource } from '../../deadvox/src/core/content.ts';
import { loadVehicleBlueprint, vehicleContentIssues } from '../../deadvox/src/core/vehicleBlueprint.ts';
import { exportVehicleBlueprint, type VehicleBlueprintInput } from '../src/export.ts';
import { registryIssueText } from '../src/issues.ts';
import { DROP_SOUND } from './fixtures/parts.ts';

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
    sounds: [DROP_SOUND],
    models: [{ ...battery, id: PART }],
    items: [
      {
        id: PART,
        name: 'VAT round-trip part',
        workInProgress: false,
        category: 'misc',
        model: PART,
        size: [1, 1],
        vehicle: {
          drops: { default: DROP_SOUND.id },
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

  it('reports the registry issue after a malformed vehicle source is dropped', () => {
    const malformed = exportVehicleBlueprint({
      ...input,
      id: 'vat_malformed_host',
      fittings: [{ ...input.fittings[0]!, part: 'vat_missing_part' }],
    });
    const { issues, registry } = buildRegistry([
      { source: 'inventory.json', data: inventory },
      sourceFor(malformed.vehicleBlueprints[0]!),
    ]);

    expect(registry.vehicleBlueprints.has('vat_malformed_host')).toBe(false);
    expect(registryIssueText(issues)).toContain('vehicleBlueprints[0].fittings[0].part: no item "vat_missing_part"');
  });
});
