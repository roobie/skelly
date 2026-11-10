(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    cloth_bundle: ['cloth', 'cloth'],
    glass_shards: ['glass'],
    rubber_strip: ['polymer', 'polymer'],
    wood_offcut: ['wood', 'wood'],
  },
).pack({
  models: [
    { id: 'glass_shards', file: 'assets/models/glass_shards.glb' },
    { id: 'wood_offcut', file: 'assets/models/wood_offcut.glb' },
    { id: 'rubber_strip', file: 'assets/models/rubber_strip.glb' },
    { id: 'cloth_bundle', file: 'assets/models/cloth_bundle.glb' },
  ] + (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.materials/things/index.json', [import 'materials-items.jsonnet']),
})
