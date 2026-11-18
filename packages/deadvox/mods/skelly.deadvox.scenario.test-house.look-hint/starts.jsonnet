local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'lookhint',
    site: 'testHouseLookHint',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
