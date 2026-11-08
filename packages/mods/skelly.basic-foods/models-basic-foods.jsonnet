(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ apple: ['organic', 'wood', 'organic'] },
).pack({
  models: import 'packages/skelly-assets/built/skelly.basic-foods/things/index.json',
})
