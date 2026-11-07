local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.playtest.debug',
  tier='scenario',
  optIn=true,
  content=['catalogue'],
  dependencies=['skelly.deadvox.scenario.playtest'],
)
