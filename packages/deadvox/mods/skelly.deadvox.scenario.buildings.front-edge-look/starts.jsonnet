local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The front-edge look's start: on the road at noon, facing both fronts.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'frontedgelook',
    site: 'frontEdgeLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
