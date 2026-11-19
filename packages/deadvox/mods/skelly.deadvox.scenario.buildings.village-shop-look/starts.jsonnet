local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The village shop look's start: on the road at noon, facing the shop fronts.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'villageshoplook',
    site: 'villageShopLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
