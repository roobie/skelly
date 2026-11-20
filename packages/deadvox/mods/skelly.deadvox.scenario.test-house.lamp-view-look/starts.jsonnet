local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'lampviewlook', site: 'testHouseLampView',
    startTimeGameTimeOfDay: '22:00',
    kit: kit.fixture.kit + [
      { id: 'glass_lamp', item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: [3, 42, -38] } },
      { id: 'hidden_lamp', item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: [12, 42, -38] } },
      { id: 'spill_lamp', item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: [24, 44, -39] } },
    ],
  }],
}
