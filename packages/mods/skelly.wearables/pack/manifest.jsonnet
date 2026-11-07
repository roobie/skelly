local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.wearables',
  tier='core',
  content=['wearables-items', 'wearables-sounds', 'models-wearables'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.materials', 'skelly.readables', 'skelly.melee-classes'],
)
