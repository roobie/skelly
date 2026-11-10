local partless = std.set(['canned_beans', 'canned_soup']);
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ beans: ['organic', 'organic'], soup: ['organic', 'organic'] },
).pack({
  models: [
    if std.setMember(model.id, partless) then std.objectRemoveKey(model, 'parts') else model
    for model in (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.packaged-foods/things/index.json', [import 'packaged-foods-items.jsonnet'])
  ],
})
