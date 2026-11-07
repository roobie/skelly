local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.melee',
  tier='theme',
  content=['melee-items', 'models-melee'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.crafting', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials',
    'skelly.melee-classes', 'skelly.natural-world', 'skelly.structures',
  ],
)
