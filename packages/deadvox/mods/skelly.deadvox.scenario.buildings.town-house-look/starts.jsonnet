local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The town house look's start: on the street at noon, facing the house fronts.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'townhouselook',
    site: 'townHouseLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
