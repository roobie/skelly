local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.gauntlet.villa-look',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.gauntlet.debug']),
)
