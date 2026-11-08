local fill = import 'tools/jsonnet/lib/fuel-supply.libsonnet';
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    lamp_oil_bottle: ['glass', 'metal', 'paper', 'fuel'],
    iron_pot: ['metal', 'metal'],
    pan: ['metal', 'mineral'],
  },
  supplies={ lamp_oil_bottle: fill('fuel-fill') },
).pack({
  models: [{ id: 'lamp_oil_bottle', file: 'assets/models/lamp_oil_bottle.glb' }] + import 'packages/skelly-assets/built/skelly.containers/things/index.json',
})
