local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.controls',
  tier='theme',
  content=['controls'],
)
