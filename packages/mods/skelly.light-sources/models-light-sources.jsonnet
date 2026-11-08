local fill = import 'tools/jsonnet/lib/fuel-supply.libsonnet';
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    glowstick: ['polymer', 'polymer'],
    everburning_torch: ['wood', 'metal', 'fuel', 'cloth', 'wood'],
  },
  supplies={
    lighter: fill('fuel_fill:fuel_fill'),
    oil_lamp: fill('fuel_fill:fuel_fill'),
  },
).pack({
  models: [
    { id: 'glowstick', file: 'assets/models/glowstick.glb', emissiveMaterial: 'chemical-light tube' },
    { id: 'road_flare', file: 'assets/models/glowstick.glb', emissiveMaterial: 'chemical-light tube' },
  ] + import 'packages/skelly-assets/built/skelly.light-sources/things/index.json',
})
