local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Midnight, so the hut's lamp is the only light: through the clear window the shambler outside is drawn to it,
// and the breaker on the wall beside the player switches that attention off.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'fixedlamplook',
    site: 'testHouseFixedLampLook',
    startTimeGameTimeOfDay: kit.day.midnightGameTimeOfDay,
  }],
}
