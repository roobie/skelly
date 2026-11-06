local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.tutorial.debug',
  tier='scenario',
  optIn=true,
  content=['catalogue'],
  dependencies=['skelly.deadvox.scenario.tutorial'],
)
