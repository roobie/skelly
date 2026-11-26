local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'firelook',
    site: 'testHouseFireLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
