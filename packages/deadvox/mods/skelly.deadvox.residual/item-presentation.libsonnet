(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    folded_note: ['paper', 'paper'],
    baseball_cap: ['cloth', 'polymer'],
  },
)
