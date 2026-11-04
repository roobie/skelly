local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.saves',
  tier='core',
  content=['saves'],
)
