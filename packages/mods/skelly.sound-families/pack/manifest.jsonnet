local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.sound-families',
  tier='theme',
  content=['sound-families'],
)
