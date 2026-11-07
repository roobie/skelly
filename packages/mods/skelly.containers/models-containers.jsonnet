local fill = import 'tools/jsonnet/lib/fuel-supply.libsonnet';
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ lamp_oil_bottle: ['glass', 'metal', 'paper', 'fuel'] },
  supplies={ lamp_oil_bottle: fill('fuel-fill') },
).pack({
  models: [{ id: 'lamp_oil_bottle', file: 'assets/models/lamp_oil_bottle.glb' }] + import 'things/index.json',
})
