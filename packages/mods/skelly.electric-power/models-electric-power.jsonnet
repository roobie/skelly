local index = (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.electric-power/things/index.json', [import 'electric-power-items.jsonnet']);
local tweaks = { flashlight: { grip: { at: [0, 0, 0.085] }, anchors: { lens: [0, 0, 0.199] } } };
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: [
    model + (if std.objectHas(tweaks, model.id) then tweaks[model.id] else {})
    for model in index
  ],
})
