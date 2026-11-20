local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'probecrowdlook',
    site: 'testHouseProbeCrowdLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
