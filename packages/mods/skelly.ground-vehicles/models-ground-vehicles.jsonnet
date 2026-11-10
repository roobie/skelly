(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: [
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/scissor_jack.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/bottle_jack.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/engine_hoist.model.json',
  ],
})
