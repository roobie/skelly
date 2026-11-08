local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.actors',
  tier='product',
  content=['actors-items', 'actors-sounds', 'enemies', 'figures-actors', 'footstep-sounds', 'item-economy', 'models-actors'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.deadvox.loot', 'skelly.inventory', 'skelly.manufactured-blocks', 'skelly.melee-classes',
    'skelly.natural-world',
  ],
)
