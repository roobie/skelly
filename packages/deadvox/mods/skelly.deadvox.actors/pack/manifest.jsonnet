local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.actors',
  tier='product',
  content=['actors-items', 'actors-sounds', 'enemies', 'footstep-sounds', 'item-economy', 'models-actors'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.deadvox.loot', 'skelly.inventory', 'skelly.manufactured-blocks', 'skelly.melee-classes',
    'skelly.natural-world',
  ],
)
