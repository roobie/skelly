local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.electronics',
  tier='theme',
  content=['electronics-items', 'models-electronics'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.crafting', 'skelly.hand-tools', 'skelly.inventory', 'skelly.materials', 'skelly.natural-world', 'skelly.structures'],
)
