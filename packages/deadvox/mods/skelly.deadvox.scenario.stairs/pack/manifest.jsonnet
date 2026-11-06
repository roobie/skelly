local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.stairs',
  tier='scenario',
  content=['layouts-stairs', 'starts', 'templates-stairs'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.firearms', 'skelly.light-sources',
    'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods',
    'skelly.structures', 'skelly.wearables',
  ],
)
