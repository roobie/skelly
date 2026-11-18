local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The workshop cars look's start: in the hall at noon with every skill at its top. The hall's own shambler and
// runner still spawn, so the shotgun's shells are pocketed in case the look runs without god mode.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'workshopcarslook',
    site: 'workshopCarsLook',
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
