local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Night, so the lamps are the light; the house supply keeps them on.
{
  starts: [kit.fixture + {
    id: 'darknesslook',
    site: 'testHouseDarknessLook',
    startTimeGameTimeOfDay: '22:00',
  }],
}
