local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The battery slot on a light's item card by eye: a flashlight with a battery fitted and a spare battery,
// both in the jeans' pockets, so the card can be loaded and unloaded without any setup.
{
  starts: [kit.fixture + {
    id: 'batteryslotlook',
    site: 'testHouseAmalgam',
    // The test-house debug start stays the site's default; this row is chosen only as its start mod.
    defaultForSite:: true,
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.fixture.kit + [
      { id: 'flashlight', item: 'flashlight', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'spare_battery', item: 'aa_battery', destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
    ],
  }],
}
