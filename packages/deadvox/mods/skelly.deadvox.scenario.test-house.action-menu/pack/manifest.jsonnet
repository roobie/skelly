local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row, and the test-house debug mod's row is its own.
manifest(
  id='skelly.deadvox.scenario.test-house.action-menu',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.test-house.debug', 'skelly.electric-power', 'skelly.flame-tools', 'skelly.materials',
  ]),
)
