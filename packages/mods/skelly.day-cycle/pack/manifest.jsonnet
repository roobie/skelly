local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.day-cycle',
  tier='theme',
  content=['dayCycle'],
)
