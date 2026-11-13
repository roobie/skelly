(import 'tools/jsonnet/lib/item-presentation.libsonnet')(import 'presentation/item-materials.json').pack({
  models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.body/things/index.json', [import 'figures-player.jsonnet', import 'packages/deadvox/mods/skelly.deadvox.actors/actors-items.jsonnet', import 'packages/deadvox/mods/skelly.deadvox.actors/graphics-actors.jsonnet']),
})
