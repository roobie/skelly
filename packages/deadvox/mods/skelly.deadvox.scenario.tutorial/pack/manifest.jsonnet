local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.tutorial',
  tier='scenario',
  content=['starts', 'tutorial'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.deadvox.site-generation',
    'skelly.electric-power', 'skelly.firearms', 'skelly.hand-tools',
    'skelly.light-sources', 'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.melee', 'skelly.natural-world',
    'skelly.packaged-foods', 'skelly.structures', 'skelly.wearables',
  ],
)
