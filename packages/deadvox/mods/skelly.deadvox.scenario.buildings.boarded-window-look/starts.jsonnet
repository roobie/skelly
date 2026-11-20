local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Noon, so glass, boards and the worn boards' wear read in flat daylight, with a bat in hand to beat
// the worn boarding in.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'boardedwindowlook',
    site: 'boardedWindowLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.common.kit + [
      { id: 'bat', item: 'baseball_bat', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
    ],
  }],
}
