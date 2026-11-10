(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({ models: (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.deadvox.rural-sites/things/index.json', [import 'templates-medical.jsonnet', import 'rural-police.jsonnet']) })
