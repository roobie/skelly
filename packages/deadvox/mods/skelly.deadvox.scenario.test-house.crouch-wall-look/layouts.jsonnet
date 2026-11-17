local lampSites = (import '../skelly.deadvox.scenario.test-house.carried-lamp/layouts.jsonnet').layouts;
local interior = std.filter(function(row) row.id == 'testHouseCarriedLampInterior', lampSites)[0];
// An arm's length from the partition on the dark back-room side, facing it, so an eye pushed through the wall shows
// the daylit front room.
{ layouts: [interior + { id: 'testHouseCrouchWallLook', player: { position: [-10, 21, 18.75], bearing: 0 } }] }
