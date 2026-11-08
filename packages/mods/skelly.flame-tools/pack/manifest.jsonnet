local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.flame-tools',
  tier='theme',
  content=['flame-tools-items', 'models-flame-tools'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.fuel', 'skelly.inventory', 'skelly.natural-world'],
)
