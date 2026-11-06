local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.residual',
  tier='product',
  assets=assets,
  json=['assets/manifest.json'],
)
