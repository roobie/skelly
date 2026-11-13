local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.fuel',
  tier='theme',
  content=['fuel-items'],
  dependencies=['skelly.inventory', 'skelly.natural-world'],
)
