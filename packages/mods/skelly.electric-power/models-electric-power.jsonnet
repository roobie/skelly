local index = import 'things/index.json';
local tweaks = { flashlight: { grip: { at: [0.085, 0, 0] }, anchors: { lens: [0.199, 0, 0] } } };
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: [
    model + (if std.objectHas(tweaks, model.id) then tweaks[model.id] else {})
    for model in index
  ],
})
