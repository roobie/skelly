local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Its own pack because a start mod supplies exactly one start row, and the test-house debug mod's row is its own.
manifest(
  id='skelly.deadvox.scenario.test-house.action-menu',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=[
    'skelly.deadvox.scenario.test-house.debug', 'skelly.basic-recipes', 'skelly.electric-power',
    'skelly.flame-tools', 'skelly.hand-tools', 'skelly.materials', 'skelly.medicine', 'skelly.melee',
    'skelly.packaged-foods', 'skelly.wearables',
  ],
)
