local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'darknesslook',
    site: 'testHouseDarknessLook',
    startTimeGameTimeOfDay: '10:06',
  }],
}
