local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The showroom deck keeps furniture and held-menu checks together.
{
  starts: [kit.fixture + {
    id: 'actionmenulook',
    site: 'testHouse',
    // A start mod selects this loadout without replacing the site's ordinary start.
    defaultForSite:: true,
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.fixture.kit + [
      { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
      { id: 'machete', item: 'machete', condition: 0.6, destination: { kind: 'pocket', parent: 'backpack', pocket: 0 } },
      { id: 'whetstone', item: 'whetstone', destination: { kind: 'pocket', parent: 'backpack', pocket: 0 } },
      { id: 'rag', item: 'rag', count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'flashlight', item: 'flashlight', destination: { kind: 'hand', role: 'dominant' } },
      { id: 'battery', item: 'aa_battery', destination: { kind: 'hand', role: 'off' } },
    ],
    wounds: [
      { region: 'leftArm', bleeding: 'moderate' },
      { region: 'rightArm', bleeding: 'moderate' },
    ],
  }],
}
