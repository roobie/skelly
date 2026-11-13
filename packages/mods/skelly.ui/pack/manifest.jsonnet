local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.ui',
  tier='core',
  content=['ui', 'ui-sounds', 'cursor'],
  assets=assets,
  json=['assets/manifest.json'],
)
