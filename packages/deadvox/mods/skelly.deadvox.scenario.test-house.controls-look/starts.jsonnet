local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'controlslook',
    site: 'testHouse',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
