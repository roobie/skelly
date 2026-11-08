(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    broken_clock: ['polymer', 'metal', 'paper', 'glass'],
    broken_toaster: ['metal', 'polymer', 'metal'],
    circuit_board: ['polymer', 'metal', 'polymer', 'metal'],
    cracked_phone: ['polymer', 'glass', 'metal'],
    electrical_repair_kit: ['polymer', 'metal', 'polymer', 'metal'],
    glass_bulb: ['glass', 'metal', 'metal'],
    glass_lens: ['glass', 'glass'],
    table_fan: ['metal', 'polymer', 'metal'],
  },
).pack({
  models: [
    { id: id, file: 'assets/models/%s.glb' % id }
    for id in [
      'circuit_board', 'glass_lens', 'broken_toaster', 'table_fan',
      'cracked_phone', 'broken_clock', 'electrical_repair_kit', 'glass_bulb',
    ]
  ] + import 'packages/skelly-assets/built/skelly.electronics/things/index.json',
})
