local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row; the test-house debug mod owns the site.
manifest(
  id='skelly.deadvox.scenario.test-house.cell-repair-look',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house.debug', 'skelly.materials']),
)
