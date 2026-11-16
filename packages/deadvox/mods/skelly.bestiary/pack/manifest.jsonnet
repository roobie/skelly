local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.bestiary',
  tier='product',
  content=['enemies-bestiary', 'figures-bestiary'],
  assets=assets,
  json=['assets/manifest.json'],
  dependencies=['skelly.deadvox.actors'],
)
