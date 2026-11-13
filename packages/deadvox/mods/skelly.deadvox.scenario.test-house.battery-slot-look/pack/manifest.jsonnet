local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Its own pack because a start mod supplies exactly one start row, and the test-house debug mod's row is its own.
manifest(
  id='skelly.deadvox.scenario.test-house.battery-slot-look',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=[
    'skelly.deadvox.scenario.test-house.debug', 'skelly.electric-power', 'skelly.wearables',
  ],
)
