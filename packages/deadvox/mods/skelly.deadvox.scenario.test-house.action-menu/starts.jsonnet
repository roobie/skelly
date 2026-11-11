local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The held action menu by eye: the showroom deck's crate, shelf and workbench stand beside the spawn for the
// furniture menu, and the kit stocks every held-menu path.
{
  starts: [kit.fixture + {
    id: 'actionmenulook',
    site: 'testHouseAmalgam',
    // The test-house debug start stays the site's default; this row is chosen only as its start mod.
    defaultForSite:: true,
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.fixture.kit + [
      // A worn blade with a whetstone in the other hand opens the ring at once, offering Sharpen.
      { id: 'machete', item: 'machete', condition: 0.6, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'whetstone', item: 'whetstone', destination: { kind: 'hand', role: 'off' } },
      // Treat with a choice of wounds; the hoodie's beans give the blade Open can.
      { id: 'rag', item: 'rag', count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'flashlight', item: 'flashlight', destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
    ],
    wounds: [
      { region: 'leftArm', bleeding: 'moderate' },
      { region: 'rightArm', bleeding: 'moderate' },
    ],
  }],
}
