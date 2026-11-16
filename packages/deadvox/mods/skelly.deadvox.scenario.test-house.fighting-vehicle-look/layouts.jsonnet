local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole scene: the tracked fighting vehicle in the open south of the garden wall, its near side to the
// tester, so the running gear is in view from the spawn.
local at = [-8, 21, 17];
{
  layouts: [layout + {
    id: 'testHouseFightingVehicleLook',
    actors: [],
    vehicles: layout.vehicles + [
      { blueprint: 'cv9040', placementKey: 'testHouse.fighting-vehicle-look', position: at, facing: 'e' },
    ],
    player: { position: [at[0], 21, at[2] - 5], bearing: 180 },
  }],
}
