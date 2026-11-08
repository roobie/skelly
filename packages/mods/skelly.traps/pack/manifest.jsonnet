local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.traps',
  tier='theme',
  content=['traps-items', 'models-traps'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.melee-classes', 'skelly.natural-world'],
)
