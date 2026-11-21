local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.medicine',
  tier='theme',
  content=['medicine-items', 'models-medicine'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.materials', 'skelly.inventory'],
)
