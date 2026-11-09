local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.fuel',
  tier='theme',
  content=['fuel-items', 'models-fuel'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.natural-world'],
)
