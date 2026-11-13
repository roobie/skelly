(import 'tools/jsonnet/lib/item-presentation.libsonnet')(import 'presentation/item-materials.json').pack({
  models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.keys/things/index.json', [
    import 'packages/deadvox/mods/skelly.deadvox.camp/camp.jsonnet',
    import 'packages/deadvox/mods/skelly.deadvox.rural-sites/templates-medical.jsonnet',
    import 'packages/deadvox/mods/skelly.deadvox.rural-sites/rural-police.jsonnet',
    import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet.jsonnet',
    import 'packages/deadvox/mods/skelly.deadvox.scenario.lock-test/locks.jsonnet',
    import 'packages/deadvox/mods/skelly.deadvox.scenario.playtest/items-playtest.jsonnet',
  ]),
})
