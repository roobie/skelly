local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.attributes',
  tier='theme',
  content=['attributes'],
)
