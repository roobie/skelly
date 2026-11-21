local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Support by eye: the post layout stands the tester beside a plank post holding a beam run and a floor, with every
// skill at its top level and a sledgehammer in hand, so the check is breaking the post, by blows or by the debug
// build tool, and watching what it held fall into rubble.
{
  starts: [kit.fixture + {
    id: 'supportlook',
    site: 'testHouseSupportLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'sledgehammer', item: 'sledgehammer', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
    ],
  }],
}
