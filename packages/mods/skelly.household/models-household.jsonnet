(import 'tools/jsonnet/lib/item-presentation.libsonnet')(import 'presentation/item-materials.json').pack({
  models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.household/things/index.json', [import 'packages/mods/skelly.hand-tools/hand-tools-items.jsonnet']),
})
