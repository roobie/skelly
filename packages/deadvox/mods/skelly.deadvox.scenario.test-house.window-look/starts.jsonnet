local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'windowlook',
    site: 'testHouseWindowLook',
    startTimeGameTimeOfDay: '22:00',
    kit: kit.fixture.kit + [
      { id: 'hammer', item: 'hammer', destination: { kind: 'hand', role: 'dominant' } },
      { id: 'lamp', item: 'oil_lamp', lit: true, destination: { kind: 'hand', role: 'off' } },
    ],
  }],
}
