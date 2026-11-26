local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'miscbuildingsupportlook',
    site: 'miscBuildingSupportLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
