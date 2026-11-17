local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// One piece too heavy for an average character to lift whole and light enough for a ring wearer. A workbench has no
// pockets, so no rolled stock adds to its mass.
{
  layouts: [layout + {
    id: 'testHouseRingLiftLook',
    showroom: layout.showroom + { slots: [{ furniture: 'workbench' }] },
  }],
}
