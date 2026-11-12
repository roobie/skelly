local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.holdout',
  tier='scenario',
  content=['holdout'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.deadvox.scenario.gauntlet.city',
    'skelly.deadvox.site-generation', 'skelly.flame-tools', 'skelly.light-sources', 'skelly.melee',
  ],
)
