local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.flame-tools',
  tier='theme',
  content=['flame-tools-items', 'models-flame-tools'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.fuel', 'skelly.inventory', 'skelly.natural-world'],
)
