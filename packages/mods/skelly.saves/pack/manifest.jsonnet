local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.saves',
  tier='theme',
  content=['saves'],
)
