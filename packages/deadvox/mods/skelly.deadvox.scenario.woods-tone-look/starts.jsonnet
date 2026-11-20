local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'woodstonelook',
    site: 'woodsToneLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
