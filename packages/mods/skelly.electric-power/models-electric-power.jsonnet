(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    exciter_brush_set: ['mineral', 'metal', 'metal', 'metal'],
    field_fuse: ['mineral', 'metal', 'paper', 'metal'],
  },
).pack({
  models: (import 'tools/jsonnet/lib/used-models.libsonnet')(
    import 'packages/skelly-assets/built/skelly.electric-power/things/index.json',
    [import 'thermal-plant.jsonnet'],
  ),
})
