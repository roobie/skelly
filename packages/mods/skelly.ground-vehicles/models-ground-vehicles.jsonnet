(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: [
    import 'things/scissor_jack.model.json',
    import 'things/bottle_jack.model.json',
    import 'things/engine_hoist.model.json',
  ],
})
