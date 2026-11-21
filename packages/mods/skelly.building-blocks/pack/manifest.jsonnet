local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.building-blocks',
  tier='theme',
  content=['building-blocks'],
  dependencies=['skelly.natural-world'],
)
