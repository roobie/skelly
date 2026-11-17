local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// Each site stands the tester facing the spot where the look's start drops a second lamp; an empty slot row lets
// the bearing apply.
local site(id, position, bearing) = layout + {
  id: id,
  buildings: layout.buildings + [{ template: 'test_house_carried_lamp_room', position: [-12, 20.5, 14], rotation: 0 }],
  showroom: layout.showroom + { slots: [] },
  player: { position: position, bearing: bearing },
};
{
  layouts: [
    site('testHouseCarriedLampOutdoors', [-16, 21, 16.25], 0),
    site('testHouseCarriedLampDoorway', [-11.75, 21, 16.25], 90),
    site('testHouseCarriedLampInterior', [-10.5, 21, 20.25], 90),
  ],
}
