local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'blastlook',
    site: 'testHouseBlastLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'frag_grenade', item: 'frag_grenade', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
    ],
  }],
}
