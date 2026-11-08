local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.melee',
  tier='theme',
  content=['melee-items', 'models-melee'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.crafting', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials',
    'skelly.melee-classes', 'skelly.natural-world', 'skelly.structures',
  ],
)
