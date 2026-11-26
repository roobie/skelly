local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'holdoutworkshopsupportlook',
    site: 'testHouseHoldoutWorkshopSupportLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
