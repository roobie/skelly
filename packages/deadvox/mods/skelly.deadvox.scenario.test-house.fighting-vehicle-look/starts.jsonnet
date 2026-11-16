local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The tracked fighting vehicle by eye: the tester spawns at noon beside its near-side running gear.
{
  starts: [kit.fixture + {
    id: 'fightingvehiclelook',
    site: 'testHouseFightingVehicleLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
