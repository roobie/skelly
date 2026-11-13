local fill = import 'tools/jsonnet/lib/fuel-supply.libsonnet';
local tweaks = { flashlight: { grip: { at: [0, 0, 0.085] }, anchors: { lens: [0, 0, 0.199] } } };
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
  ] + [
    model + (if std.objectHas(tweaks, model.id) then tweaks[model.id] else {})
    for model in (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.light-sources/things/index.json', [import 'light-sources-items.jsonnet', import 'packages/mods/skelly.electric-power/electric-power-items.jsonnet', import 'packages/mods/skelly.electronics/electronics-items.jsonnet'])
  ],
})
