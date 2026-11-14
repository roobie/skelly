local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The player starts in the kitchen by the house's south-west lamp, with a loose wardrobe two metres east to carry up
// against the lamp: the wall that must shade it. The reading booth stands south-west of the house, walled from the
// lamps, for the check that it stays dark.
local wardrobe = { furniture: 'wardrobe', placement: { position: [6.5, 21, -1], facing: 'n' } };
{
  layouts: [layout + {
    id: 'testHouseDarknessLook',
    showroom: layout.showroom + {
      capacity: std.length(layout.showroom.slots) + 1,
      slots: layout.showroom.slots + [wardrobe],
    },
    player: { position: [8.5, 21, -1.75], bearing: 90 },
  }],
}
