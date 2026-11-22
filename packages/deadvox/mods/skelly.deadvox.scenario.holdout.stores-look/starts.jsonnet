local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The stores look's start: at noon between the two stores' doors, facing them.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'holdoutstoreslook',
    site: 'holdoutStoresLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
