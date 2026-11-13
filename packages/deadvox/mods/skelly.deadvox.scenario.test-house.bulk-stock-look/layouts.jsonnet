local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [
    layout + {
      id: 'testHouseBulkStock',
      // The bulk-stock look: the three material stacks stand on the showroom deck beside spawn — the board pile
      // along the west edge, the sheet and fastener stacks along the south edge. Spawn faces the newest slot,
      // the fastener crate.
      showroom: layout.showroom + {
        slots: [
          { furniture: 'board_stack', placement: { position: [-12, 21.5, -2], facing: 'n' } },
          { furniture: 'sheet_metal_stack', placement: { position: [-11.5, 21.5, 0.5], facing: 'n' } },
          { furniture: 'fastener_crate', placement: { position: [-8.5, 21.5, 0.5], facing: 'n' } },
        ],
      },
    },
  ],
}
