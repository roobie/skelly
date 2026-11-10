local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.wearables',
  tier='core',
  content=['wearables-items', 'wearables-sounds', 'models-wearables'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.materials', 'skelly.readables', 'skelly.melee-classes'],
)
