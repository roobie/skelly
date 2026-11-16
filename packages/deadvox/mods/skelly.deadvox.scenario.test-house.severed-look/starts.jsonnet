local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'severedlook',
    site: 'testHouseSeveredLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
