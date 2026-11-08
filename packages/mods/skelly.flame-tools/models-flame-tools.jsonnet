(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: import 'packages/skelly-assets/built/skelly.flame-tools/things/index.json',
})
