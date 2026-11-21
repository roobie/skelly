local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// One repair reaches the ceiling from this damage band, so the crack check needs no repeated work
// (`packages/deadvox/DESIGN.md`, "Damaged terrain cracks").
{
  starts: [kit.fixture + {
    id: 'cellrepairlook',
    site: 'testHouseCellRepairLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    blockDamage: [{ cell: [-22, 45, 28], damage: 240 }],
    kit+: [
      { id: 'pack', item: 'school_backpack', condition: 0.8, destination: { kind: 'worn' } },
      { id: 'repair_kit', item: 'repair_kit', destination: { kind: 'pocket', parent: 'pack', pocket: 0 } },
      { id: 'scrap_1', item: 'scrap_metal', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      { id: 'scrap_2', item: 'scrap_metal', destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
    ],
    recipes+: ['repair_brick', 'repair_planks'],
  }],
}
