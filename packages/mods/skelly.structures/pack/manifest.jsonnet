local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.structures',
  tier='core',
  content=['structures-furniture', 'structures-items', 'structures-sounds', 'models-structures'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.natural-world', 'skelly.materials', 'skelly.inventory'],
)
