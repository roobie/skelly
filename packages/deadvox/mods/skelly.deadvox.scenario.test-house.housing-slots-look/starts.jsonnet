local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The spare fits the empty slot and the pocketed part fits none, so both checks start from the spawn.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'housingslotslook',
    site: 'testHouseHousingSlots',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'spare', item: 'fixture_housing_spare', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'odd', item: 'fixture_housing_odd_part', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
    ],
  }],
}
