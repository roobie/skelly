local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.audio.impact',
  tier='core',
  content=['sounds-impact'],
  assets=assets,
  json=['assets/manifest.json'],
)
