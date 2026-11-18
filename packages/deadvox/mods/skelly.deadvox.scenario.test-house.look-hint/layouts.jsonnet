local lampSites = (import '../skelly.deadvox.scenario.test-house.carried-lamp/layouts.jsonnet').layouts;
local interior = std.filter(function(row) row.id == 'testHouseCarriedLampInterior', lampSites)[0];
// The spawn faces the partition at arm's length, so its named block is visible before the tester moves.
{ layouts: [interior + { id: 'testHouseLookHint', player: { position: [-10, 21, 18.75], bearing: 0 } }] }
