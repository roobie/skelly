local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.electric-power',
  tier='theme',
  content=['electric-power-items', 'electric-power-furniture', 'models-electric-power', 'power'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.crafting', 'skelly.electronics', 'skelly.inventory', 'skelly.materials', 'skelly.natural-world'],
)
