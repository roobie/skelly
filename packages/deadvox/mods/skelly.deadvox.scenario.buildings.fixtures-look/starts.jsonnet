local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Noon, so the box shapes read in flat daylight.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'fixtureslook',
    site: 'fixturesLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
