local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.household',
  tier='core',
  content=['models-household'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.inventory'],
)
