local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Cell repair by eye: the alcove layout stands the tester inside a brick alcove, facing its north wall, and
// the start ships that wall's eye-height brick already cracked, so the look is the crack at start, then the
// debug build tool and its repair key through the repair recipe the kit teaches; cell repair has no crafting
// view until #1469. The damage amount is content here, not code.
{
  starts: [kit.fixture + {
    id: 'cellrepairlook',
    site: 'testHouseCellRepairLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    blockDamage: [{ cell: [-22, 45, 28], damage: 120 }],
    kit+: [
      { id: 'pack', item: 'school_backpack', condition: 0.8, destination: { kind: 'worn' } },
      { id: 'repair_kit', item: 'repair_kit', destination: { kind: 'pocket', parent: 'pack', pocket: 0 } },
      { id: 'scrap_1', item: 'scrap_metal', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'scrap_2', item: 'scrap_metal', destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
    ],
    recipes+: ['repair_brick', 'repair_planks'],
  }],
}
