local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.containers',
  tier='theme',
  content=['containers-items', 'models-containers'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/fuel-parts.json', 'presentation/item-materials.json'],
  dependencies=['skelly.fuel', 'skelly.inventory', 'skelly.natural-world'],
)
