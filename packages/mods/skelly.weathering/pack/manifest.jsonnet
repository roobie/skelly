local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.weathering',
  tier='core',
  content=['weathering'],
)
