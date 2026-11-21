local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row; the room builds on the test-house lot.
manifest(
  id='skelly.deadvox.scenario.test-house.placement-look',
  tier='scenario',
  optIn=true,
  content=['placement', 'layouts', 'starts'],
  overrides=[{ pack: 'skelly.basic-recipes', entry: 'recipes:' + id } for id in ['board_up_door', 'build_wood_shelf']],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.test-house', 'skelly.basic-recipes', 'skelly.manufactured-blocks',
    'skelly.materials', 'skelly.structures',
  ]),
)
