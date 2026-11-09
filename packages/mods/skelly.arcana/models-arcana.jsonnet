(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    binder_top: ['cloth', 'polymer', 'cloth'],
    crystal_butt_wand: ['wood', 'organic', 'metal', 'glass'],
    crystal_socket_wand: ['glass', 'metal', 'wood', 'wood'],
    rune_clay_tablet: ['mineral', 'mineral'],
  },
).pack({ models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.arcana/things/index.json', []) })
