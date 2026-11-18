local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [
    layout + {
      id: 'testHouseHousingSlots',
      // Only the showroom deck: a site is one grid, so the house's own supply would light the lamp without the modules.
      buildings: [building for building in layout.buildings if building.template == 'test_house_showroom'],
      // The housings, the full bin and the plant modules are in reach from the spawn.
      player: { position: [-10.5, 21.5, -1], bearing: 90 },
      showroom: layout.showroom + {
        capacity: 12,
        slots: [
          // Two fixed housings at different places, so their untouched parts vary by placement alone.
          { furniture: 'fixture_housing', fixed: true, placement: { position: [-11.5, 21.5, 0.5], facing: 'n' } },
          { furniture: 'fixture_housing', fixed: true, placement: { position: [-8.5, 21.5, 0.5], facing: 'n' } },
          {
            furniture: 'fixture_full_bin', placement: { position: [-12, 21.5, -2], facing: 'n' },
            items: [{ item: 'fixture_housing_odd_part', count: 1 }],
          },
          {
            furniture: 'fixture_plant_failed_module', fixed: true,
            placement: { position: [-7, 21.5, 0.5], facing: 'n' },
          },
          {
            furniture: 'fixture_plant_working_module', fixed: true,
            placement: { position: [-5.5, 21.5, 0.5], facing: 'n' },
          },
          { furniture: 'electric_lamp', fixed: true, placement: { position: [-5.5, 21.5, -2.5], facing: 'n' } },
        ] + [
          // Worn to one blow from ruin. The open module has free floor around it; kerbs fill every floor cell beside
          // the blocked one, so its ruin has no room for its parts.
          {
            furniture: 'fixture_plant_open_ruin_module', fixed: true, wear: 0.95,
            placement: { position: [-8, 21.5, -2], facing: 'n' },
          },
          {
            furniture: 'fixture_plant_blocked_ruin_module', fixed: true, wear: 0.95,
            placement: { position: [-9.5, 21.5, -2], facing: 'n' },
          },
        ] + [
          { furniture: 'fixture_ruin_kerb', fixed: true, placement: { position: at, facing: 'n' } }
          for at in [[-10, 21.5, -2], [-9, 21.5, -2], [-9.5, 21.5, -2.5], [-9.5, 21.5, -1.5]]
        ],
      },
    },
  ],
}
