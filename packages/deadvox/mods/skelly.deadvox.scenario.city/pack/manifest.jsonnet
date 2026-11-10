local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.city',
  tier='scenario',
  content=['starts'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.site-generation', 'skelly.light-sources', 'skelly.medicine',
    'skelly.melee', 'skelly.packaged-foods', 'skelly.wearables',
  ],
)
