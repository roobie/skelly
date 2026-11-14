local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'itemlightlook',
    site: 'testHouseItemLightLook',
    startTimeGameTimeOfDay: '22:00',
    kit: kit.fixture.kit + [
      { id: 'lantern', item: 'oil_lamp', lit: true, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'other_lantern', item: 'oil_lamp', lit: true, destination: { kind: 'hand', role: 'off' } },
    ],
  }],
}
