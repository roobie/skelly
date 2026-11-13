local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.gauntlet.night-fog-look',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=['skelly.deadvox.scenario.gauntlet.debug'],
)
