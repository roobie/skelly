local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.containers',
  tier='theme',
  content=['containers-items', 'models-containers'],
  things=things,
  assets=assets,
  json=[
    'things/index.json', 'assets/manifest.json', 'exports/things.json',
    'presentation/fuel-parts.json', 'presentation/item-materials.json',
  ],
  dependencies=['skelly.fuel', 'skelly.inventory', 'skelly.natural-world'],
)
