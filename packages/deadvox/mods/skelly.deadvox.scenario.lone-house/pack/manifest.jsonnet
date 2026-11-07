local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.lone-house',
  tier='scenario',
  content=['layouts', 'starts'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.deadvox.buildings',
    'skelly.deadvox.site-generation', 'skelly.light-sources',
    'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods', 'skelly.wearables',
  ],
)
