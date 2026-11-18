local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Its own pack because a start mod supplies exactly one start row; depending on the magic scenario lets the look
// link name this pack alone.
manifest(
  id='skelly.deadvox.scenario.with-magic.missile-high',
  tier='scenario',
  optIn=true,
  content=['missile-look'],
  dependencies=(import '../../skelly.deadvox.scenario.with-magic/missile-look.libsonnet').dependencies,
)
