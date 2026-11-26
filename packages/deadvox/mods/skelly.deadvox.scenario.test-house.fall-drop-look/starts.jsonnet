local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'falldroplook',
    site: 'testHouseFallDropLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
