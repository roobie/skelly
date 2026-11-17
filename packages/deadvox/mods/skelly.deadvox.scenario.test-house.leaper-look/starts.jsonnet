local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'leaperlook',
    site: 'testHouseLeaperLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'shotgun', item: 'pump_shotgun', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      // A start hands over no loaded weapon until #1570, so the ammunition is pocketed.
      {
        id: 'buckshot', item: 'shell_12_gauge_00_buck', count: 8,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 0 },
      },
    ],
  }],
}
