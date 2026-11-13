local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.senses',
  tier='core',
  content=['senses'],
  dependencies=['skelly.sound-families'],
)
