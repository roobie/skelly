local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.light-sources',
  tier='theme',
  content=['light-sources-items', 'models-light-sources'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.crafting', 'skelly.fuel', 'skelly.inventory', 'skelly.materials', 'skelly.natural-world'],
)
