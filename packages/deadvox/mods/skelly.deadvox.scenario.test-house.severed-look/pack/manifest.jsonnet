local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row.
manifest(
  id='skelly.deadvox.scenario.test-house.severed-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts', 'templates'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house', 'skelly.deadvox.actors', 'skelly.structures']),
)
