local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.sound-families',
  tier='core',
  content=['sound-families'],
)
