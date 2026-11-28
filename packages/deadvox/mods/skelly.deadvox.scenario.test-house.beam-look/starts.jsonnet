local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'beamlook',
    site: 'testHouseBeamLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    fires: [{ cell: [2, 48, 31], strength: 11 }],
  }],
}
