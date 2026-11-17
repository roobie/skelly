local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'lampcubeone', site: 'testHouseLampCube',
    startTimeGameTimeOfDay: '22:00',
    kit: kit.fixture.kit + [{
      id: 'lamp', item: 'oil_lamp', lit: true,
      destination: { kind: 'hand', role: 'dominant' },
    }],
  }],
}
