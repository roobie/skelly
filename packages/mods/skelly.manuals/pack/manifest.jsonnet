local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.manuals',
  tier='theme',
  content=['manuals-items'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.electric-power', 'skelly.electronics', 'skelly.firearms', 'skelly.light-sources',
    'skelly.melee', 'skelly.readables',
  ],
)
