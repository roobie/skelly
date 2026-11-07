local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.ground-vehicles',
  tier='theme',
  content=['vehicles', 'ground-vehicles-items', 'models-ground-vehicles'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.hand-tools', 'skelly.inventory', 'skelly.natural-world'],
)
