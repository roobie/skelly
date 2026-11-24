local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The door-trail look's start: on the road at noon, facing both halls' fronts.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'doortraillook',
    site: 'doorTrailLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
