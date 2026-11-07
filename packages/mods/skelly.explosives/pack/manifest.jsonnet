local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.explosives',
  tier='theme',
  content=['explosives-items', 'explosives-sounds', 'models-explosives'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.melee-classes', 'skelly.natural-world'],
)
