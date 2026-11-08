local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.camp',
  tier='product',
  content=['camp', 'item-economy', 'models-camp'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.crafting', 'skelly.deadvox.actors', 'skelly.deadvox.loot', 'skelly.firearms', 'skelly.inventory',
    'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.natural-world', 'skelly.packaged-foods',
    'skelly.readables', 'skelly.structures',
  ],
)
