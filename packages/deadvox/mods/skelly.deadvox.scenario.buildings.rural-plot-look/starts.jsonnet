local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The rural plot look's start: on the road at noon, facing the plots.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'ruralplotlook',
    site: 'ruralPlotLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
