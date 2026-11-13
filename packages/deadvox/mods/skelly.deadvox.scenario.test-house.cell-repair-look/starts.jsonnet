local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Cell repair by eye: the test house stands the tester beside its brick walls. The build tool (B) cracks a wall
// block (D), and Shift+R mends the aimed block through the repair recipe the kit teaches; there is no crafting
// UI for cell repair yet, so the debug tool is the look's trigger.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'cellrepairlook',
    site: 'testHouseAmalgam',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'pack', item: 'school_backpack', condition: 0.8, destination: { kind: 'worn' } },
      { id: 'repair_kit', item: 'repair_kit', destination: { kind: 'pocket', parent: 'pack', pocket: 0 } },
      { id: 'scrap_1', item: 'scrap_metal', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'scrap_2', item: 'scrap_metal', destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
    ],
    recipes+: ['repair_brick', 'repair_planks'],
  }],
}
