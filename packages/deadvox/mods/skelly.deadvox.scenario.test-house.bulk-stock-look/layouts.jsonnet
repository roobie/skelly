local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [
    layout + {
      id: 'testHouseBulkStock',
      // The half-full board stack is in reach for the refused-put check.
      player: { position: [-10.5, 21.5, -1], bearing: 90 },
      showroom: layout.showroom + {
        slots: [
          {
            furniture: 'sheet_metal_stack', placement: { position: [-11.5, 21.5, 0.5], facing: 'n' },
            items: [{ item: 'scrap_metal', count: 10 }],
          },
          {
            furniture: 'crate', placement: { position: [-8.5, 21.5, 0.5], facing: 'n' },
            items: [{ item: 'nail_box', placement: 'surface' }],
          },
          {
            furniture: 'board_stack', placement: { position: [-12, 21.5, -2], facing: 'n' },
            items: [{ item: 'wooden_plank', count: 18 }],
          },
        ],
      },
    },
  ],
}
