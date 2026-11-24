local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The townhouse upper look's start: on the top storey of a three-storey townhouse at noon.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'townhouseupperlook',
    site: 'townhouseUpperLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
