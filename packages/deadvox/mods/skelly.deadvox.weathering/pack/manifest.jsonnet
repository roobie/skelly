local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.weathering',
  tier='product',
  content=['deadvox-weathering'],
  dependencies=['skelly.weathering'],
)
