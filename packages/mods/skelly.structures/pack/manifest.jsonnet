local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.structures',
  tier='core',
  content=['structures-furniture', 'structures-items', 'structures-sounds', 'models-structures'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.materials', 'skelly.natural-world'],
)
