(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ bandage: ['cloth', 'paper'] },
).pack({
  models: import 'things/index.json',
})
