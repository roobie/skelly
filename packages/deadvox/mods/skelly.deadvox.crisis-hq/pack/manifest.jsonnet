local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.crisis-hq',
  tier='product',
  content=['crisis-hq-fixtures', 'crisis-hq'],
  dependencies=[
    'skelly.deadvox.actors', 'skelly.deadvox.camp', 'skelly.deadvox.loot', 'skelly.deadvox.rural-sites',
    'skelly.deadvox.site-generation', 'skelly.manufactured-blocks', 'skelly.natural-world', 'skelly.structures',
  ],
)
