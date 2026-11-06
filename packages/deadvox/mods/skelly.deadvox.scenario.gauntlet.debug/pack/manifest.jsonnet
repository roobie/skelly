local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.gauntlet.debug',
  tier='scenario',
  optIn=true,
  content=['catalogue'],
  dependencies=['skelly.deadvox.scenario.gauntlet.city', 'skelly.deadvox.scenario.gauntlet.start'],
)
