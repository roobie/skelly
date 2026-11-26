local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'furniturepushlook',
    site: 'testHouseFurniturePushLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
