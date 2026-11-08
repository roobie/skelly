local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.ground-vehicles',
  tier='theme',
  content=['vehicles', 'ground-vehicles-items', 'models-ground-vehicles'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.hand-tools', 'skelly.inventory', 'skelly.natural-world'],
)
