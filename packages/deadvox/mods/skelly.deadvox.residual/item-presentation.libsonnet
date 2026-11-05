(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    baseball_cap: ['cloth', 'polymer'],
  },
)
