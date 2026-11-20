local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The townhouse look's start: on the near street at noon, facing the brick fronts.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'townhouselook',
    site: 'townhouseLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
