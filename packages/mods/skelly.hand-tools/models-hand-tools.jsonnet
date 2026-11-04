local dial = {
  face: 'paint-cream',
  ink: 'plastic-black',
  north: 'plastic-red',
  south: 'plastic-black',
  marks: ['N', 'E', 'S', 'W'],
  markHeight: 0.3,
  needleLength: 0.6,
  needleWidth: 0.2,
};
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ sewing_kit: ['polymer', 'cloth', 'metal', 'polymer'] },
).pack({
  models: [{ id: 'sewing_kit', file: 'assets/models/sewing_kit.glb' }] + [
    if model.id == 'compass' then model + { dial: dial } else model
    for model in import 'things/index.json'
  ],
})
