local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [
    layout + {
      id: 'testHouseHousingSlots',
      // Both housings and the full bin are in reach from the spawn.
      player: { position: [-10.5, 21.5, -1], bearing: 90 },
      showroom: layout.showroom + {
        capacity: 3,
        slots: [
          // Two fixed housings at different places, so their untouched parts vary by placement alone.
          { furniture: 'fixture_housing', fixed: true, placement: { position: [-11.5, 21.5, 0.5], facing: 'n' } },
          { furniture: 'fixture_housing', fixed: true, placement: { position: [-8.5, 21.5, 0.5], facing: 'n' } },
          {
            furniture: 'fixture_full_bin', placement: { position: [-12, 21.5, -2], facing: 'n' },
            items: [{ item: 'fixture_housing_odd_part', count: 1 }],
          },
        ],
      },
    },
  ],
}
