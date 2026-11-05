local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.electronics',
  tier='theme',
  content=['electronics-items', 'models-electronics'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.crafting', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials', 'skelly.natural-world', 'skelly.structures'],
)
