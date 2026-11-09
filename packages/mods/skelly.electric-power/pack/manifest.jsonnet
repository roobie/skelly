local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.electric-power',
  tier='theme',
  content=['electric-power-items', 'electric-power-furniture', 'models-electric-power', 'power'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.crafting', 'skelly.electronics', 'skelly.inventory', 'skelly.materials', 'skelly.natural-world'],
)
