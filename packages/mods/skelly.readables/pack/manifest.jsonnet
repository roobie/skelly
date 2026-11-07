local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.readables',
  tier='core',
  content=['readables', 'models-readables'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.natural-world', 'skelly.inventory'],
)
