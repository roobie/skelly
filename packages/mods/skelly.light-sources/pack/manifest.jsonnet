local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.light-sources',
  tier='theme',
  content=['light-sources-items', 'models-light-sources'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.crafting', 'skelly.fuel', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials', 'skelly.natural-world'],
)
