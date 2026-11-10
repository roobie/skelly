local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.benchmark-city',
  tier='scenario',
  content=['benchmark-city'],
  dependencies=['skelly.deadvox.buildings'],
)
