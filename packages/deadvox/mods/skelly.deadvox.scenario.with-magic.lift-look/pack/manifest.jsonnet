local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row; depending on the magic scenario lets the look
// link name this pack alone.
manifest(
  id='skelly.deadvox.scenario.with-magic.lift-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house', 'skelly.deadvox.scenario.with-magic']),
)
