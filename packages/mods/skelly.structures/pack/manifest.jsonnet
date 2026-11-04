local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.structures',
  tier='core',
  content=['structures-furniture', 'structures-items', 'structures-sounds', 'models-structures'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.natural-world', 'skelly.materials', 'skelly.inventory'],
)
