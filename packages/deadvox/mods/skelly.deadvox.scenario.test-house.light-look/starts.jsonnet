local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'lightlook',
    site: 'testHouseLightLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
