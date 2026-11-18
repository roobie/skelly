local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The spare fits the empty slot and the pocketed part fits none, so both checks start from the spawn; the core is the
// failed plant module's spare, and the bat deals the final blow to the worn modules.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'housingslotslook',
    site: 'testHouseHousingSlots',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'bat', item: 'baseball_bat', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'spare', item: 'fixture_housing_spare', condition: 1, destination: { kind: 'hand', role: 'off' } },
      { id: 'odd', item: 'fixture_housing_odd_part', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'core', item: 'fixture_plant_core', condition: 1, destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
    ],
  }],
}
