local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.basic-recipes',
  tier='theme',
  content=['basic-recipes-items'],
  dependencies=[
    'skelly.crafting', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials', 'skelly.medicine',
    'skelly.natural-world', 'skelly.readables', 'skelly.structures', 'skelly.wearables',
  ],
)
