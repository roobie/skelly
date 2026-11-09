local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.explosives',
  tier='theme',
  content=['explosives-items', 'explosives-sounds', 'models-explosives'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory', 'skelly.melee-classes', 'skelly.natural-world'],
)
