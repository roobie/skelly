(import 'tools/jsonnet/lib/item-presentation.libsonnet')(import 'presentation/item-materials.json').pack({
  models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.structures/things/index.json', [import 'structures-items.jsonnet']),
})
