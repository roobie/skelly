local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The rural house look's start: on the road at noon, facing the house fronts.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'ruralhouselook',
    site: 'ruralHouseLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
