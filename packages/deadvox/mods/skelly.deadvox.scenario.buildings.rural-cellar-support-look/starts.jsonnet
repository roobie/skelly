local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'ruralcellarsupportlook',
    site: 'ruralCellarSupportLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [{ id: 'lamp', item: 'oil_lamp', lit: true, destination: { kind: 'hand', role: 'dominant' } }],
  }],
}
