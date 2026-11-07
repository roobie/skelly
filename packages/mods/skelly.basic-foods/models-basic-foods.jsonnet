(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ apple: ['organic', 'wood', 'organic'] },
).pack({
  models: import 'things/index.json',
})
