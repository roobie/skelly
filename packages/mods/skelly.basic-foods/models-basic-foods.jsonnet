local partless = std.set(['canned_beans', 'canned_soup']);
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ apple: ['organic', 'wood', 'organic'], beans: ['organic', 'organic'], soup: ['organic', 'organic'] },
).pack({
  models: [
    if std.setMember(model.id, partless) then std.objectRemoveKey(model, 'parts') else model
    for model in (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.basic-foods/things/index.json', [import 'basic-foods-items.jsonnet', import 'packages/mods/skelly.packaged-foods/packaged-foods-items.jsonnet'])
  ],
})
