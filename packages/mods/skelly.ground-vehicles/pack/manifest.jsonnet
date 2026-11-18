local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.ground-vehicles',
  tier='theme',
  content=['vehicles', 'troop-carrier', 'ground-vehicles-items'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.audio.impact', 'skelly.firearms', 'skelly.hand-tools', 'skelly.inventory', 'skelly.natural-world'],
)
