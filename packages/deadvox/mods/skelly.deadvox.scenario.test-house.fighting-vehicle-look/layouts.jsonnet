local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole scene: the tracked fighting vehicle in the open south of the garden wall, seen from a rear
// quarter so the running gear along one side is in view from the spawn.
local at = [-8, 21, 17];
{
  layouts: [layout + {
    id: 'testHouseFightingVehicleLook',
    actors: [],
    vehicles: layout.vehicles + [
      { blueprint: 'cv9040', placementKey: 'testHouse.fighting-vehicle-look', position: at, facing: 'n' },
    ],
    // An empty slot row lets the bearing apply; the spawn otherwise turns to the newest showroom prop.
    player: { position: [at[0] - 4, 21, at[2] - 5], bearing: 140 },
    showroom: layout.showroom + { slots: [] },
  }],
}
