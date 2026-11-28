local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row; the joist run builds on the test-house lot.
manifest(
  id='skelly.deadvox.scenario.test-house.torch-cut-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies([
    'skelly.building-blocks', 'skelly.deadvox.scenario.test-house', 'skelly.flame-tools', 'skelly.fuel',
    'skelly.manufactured-blocks', 'skelly.natural-world',
  ]),
)
