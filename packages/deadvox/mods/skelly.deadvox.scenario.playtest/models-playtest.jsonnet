(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    baseball_cap: ['cloth', 'polymer'],
  },
).pack({ models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.deadvox.scenario.playtest/things/index.json', [import 'items-playtest.jsonnet']) })
