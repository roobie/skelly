local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.deadvox.actors',
  tier='product',
  content=[
    'actors-items', 'actors-sounds', 'controls-actors', 'enemies', 'figures-actors', 'footstep-sounds', 'graphics-actors',
    'item-economy',
  ],
  assets=assets,
  json=['assets/manifest.json'],
  dependencies=[
    'skelly.body', 'skelly.deadvox.loot', 'skelly.graphics', 'skelly.inventory', 'skelly.manufactured-blocks',
    'skelly.melee-classes', 'skelly.natural-world',
  ],
  overrides=[{ pack: 'skelly.graphics', entry: 'graphics:core' }],
)
