local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.senses',
  tier='theme',
  content=['senses'],
  dependencies=['skelly.sound-families'],
)
