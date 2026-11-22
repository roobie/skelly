local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.basic-recipes',
  tier='theme',
  content=['basic-recipes-items', 'basic-recipes-furniture', 'basic-recipes-construction'],
  dependencies=[
    'skelly.containers', 'skelly.crafting', 'skelly.flame-tools', 'skelly.hand-tools', 'skelly.inventory', 'skelly.manufactured-blocks', 'skelly.materials', 'skelly.medicine',
    'skelly.natural-world', 'skelly.readables', 'skelly.structures', 'skelly.wearables',
  ],
)
