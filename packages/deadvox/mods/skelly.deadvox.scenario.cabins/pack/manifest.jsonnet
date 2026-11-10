local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.cabins',
  tier='scenario',
  content=['layouts-cabins', 'starts', 'templates-cabins'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.deadvox.buildings', 'skelly.deadvox.loot',
    'skelly.deadvox.site-generation',
    'skelly.deadvox.woods', 'skelly.light-sources', 'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.melee',
    'skelly.natural-world', 'skelly.packaged-foods', 'skelly.structures', 'skelly.wearables',
  ],
)
