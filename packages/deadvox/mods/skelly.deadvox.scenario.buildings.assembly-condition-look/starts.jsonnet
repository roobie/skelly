local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'assemblyconditionlook', site: 'assemblyConditionLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
