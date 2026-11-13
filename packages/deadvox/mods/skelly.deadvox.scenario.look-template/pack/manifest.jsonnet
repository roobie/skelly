local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row. Depending on the site's pack and any debug
// mods the scene needs lets the look link name this pack alone.
manifest(
  id='skelly.deadvox.scenario.look-template',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house.debug', 'skelly.firearms']),
)
