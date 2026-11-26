local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row; the room builds on the test-house lot.
manifest(
  id='skelly.deadvox.scenario.test-house.lit-window-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.test-house', 'skelly.deadvox.actors', 'skelly.manufactured-blocks', 'skelly.materials',
    'skelly.structures',
  ]),
)
