local fill = import 'tools/jsonnet/lib/fuel-supply.libsonnet';
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    lamp_oil_bottle: ['glass', 'metal', 'paper', 'fuel'],
    school_backpack: ['cloth', 'polymer'],
    fanny_pack: ['cloth', 'polymer'],
  },
  supplies={ lamp_oil_bottle: fill('fuel-fill') },
).pack({
  models: [{ id: 'lamp_oil_bottle', file: 'assets/models/lamp_oil_bottle.glb' }] + (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.containers/things/index.json', [import 'containers-items.jsonnet', import 'packages/mods/skelly.fuel/fuel-items.jsonnet']),
})
