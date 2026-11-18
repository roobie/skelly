local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row.
manifest(
  id='skelly.deadvox.scenario.test-house.press-check-look',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house.debug', 'skelly.firearms']),
)
