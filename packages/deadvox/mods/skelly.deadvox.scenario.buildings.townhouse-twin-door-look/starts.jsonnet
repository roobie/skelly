local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The townhouse twin door look's start: inside the street door of a townhouse over a cellar at noon.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'townhousetwindoorlook',
    site: 'townhouseTwinDoorLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
