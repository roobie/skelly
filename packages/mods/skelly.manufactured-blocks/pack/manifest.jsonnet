local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.manufactured-blocks',
  tier='theme',
  content=['manufactured-blocks'],
  dependencies=['skelly.natural-world'],
)
