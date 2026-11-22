local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The stores look's start: at noon inside the works stores' door, facing down the aisle under the joists.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'holdoutstoreslook',
    site: 'holdoutStoresLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
