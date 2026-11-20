local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Noon, so the boards and the leaf's wear steps read in flat daylight, with a bat in hand to break the leaf.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'boardeddoorlook',
    site: 'boardedDoorLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.common.kit + [
      { id: 'bat', item: 'baseball_bat', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
    ],
  }],
}
