local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// Its own pack because a start mod supplies exactly one start row. It depends on the packs that own the workshop
// hall, its cars and the shotgun, so the look link names this pack alone.
manifest(
  id='skelly.deadvox.scenario.playtest.workshop-cars-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox.buildings', 'skelly.ground-vehicles', 'skelly.firearms']),
)
