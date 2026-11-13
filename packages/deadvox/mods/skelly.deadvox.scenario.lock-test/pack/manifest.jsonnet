local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.lock-test',
  tier='scenario',
  content=['item-economy', 'locks', 'starts'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.site-generation', 'skelly.inventory', 'skelly.keys',
    'skelly.light-sources', 'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.melee', 'skelly.natural-world',
    'skelly.packaged-foods', 'skelly.structures', 'skelly.wearables',
  ],
)
