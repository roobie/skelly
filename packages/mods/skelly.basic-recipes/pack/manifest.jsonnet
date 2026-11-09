local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.basic-recipes',
  tier='theme',
  content=['basic-recipes-items', 'models-basic-recipes'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.crafting', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials', 'skelly.medicine',
    'skelly.natural-world', 'skelly.readables', 'skelly.structures', 'skelly.wearables',
  ],
)
