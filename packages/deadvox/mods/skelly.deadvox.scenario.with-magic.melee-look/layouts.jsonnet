local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// Two identical crates side by side, one struck without the ring and one with it on. Neither stands worn, so only the
// ring changes how many blows each takes to break.
{
  layouts: [layout + {
    id: 'testHouseRingMeleeLook',
    showroom: layout.showroom + { slots: [{ furniture: 'crate', wear: 0 }, { furniture: 'crate', wear: 0 }] },
  }],
}
