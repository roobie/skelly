(import 'tools/jsonnet/lib/item-presentation.libsonnet')(import 'presentation/item-materials.json').pack({
  models: import 'packages/skelly-assets/built/skelly.structures/things/index.json',
})
