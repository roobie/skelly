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
    folded_note: ['paper', 'paper'],
    baseball_cap: ['cloth', 'polymer'],
  },
)
