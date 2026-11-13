local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'amalgamlook',
    site: 'testHouseAmalgam',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.fixture.kit + [
      { id: 'shotgun', item: 'pump_shotgun', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      {
        id: 'flare', item: 'road_flare', condition: 1,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 1 },
      },
      {
        id: 'buckshot', item: 'shell_12_gauge_00_buck', count: 24,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 0 },
      },
    ],
  }],
}
