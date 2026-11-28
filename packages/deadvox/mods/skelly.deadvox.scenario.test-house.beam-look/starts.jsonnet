local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'beamlook',
    site: 'testHouseBeamLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    supportLoss: [[3, 47, 29]],
  }],
}
