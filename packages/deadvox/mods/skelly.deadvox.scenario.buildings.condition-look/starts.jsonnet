local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Noon, so boards, gaps and disorder read in flat daylight.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'conditionlook',
    site: 'conditionLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
