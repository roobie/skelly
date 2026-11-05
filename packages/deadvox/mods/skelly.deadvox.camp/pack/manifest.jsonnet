local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.camp',
  tier='product',
  content=['camp', 'item-economy', 'models-camp'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.crafting', 'skelly.deadvox.actors', 'skelly.deadvox.loot', 'skelly.firearms', 'skelly.inventory',
    'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.natural-world', 'skelly.packaged-foods',
    'skelly.readables', 'skelly.structures',
  ],
)
