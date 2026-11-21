local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.graphics',
  tier='theme',
  content=['graphics', 'look'],
)
