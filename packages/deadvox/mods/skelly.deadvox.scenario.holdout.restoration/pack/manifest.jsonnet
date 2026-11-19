local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
// The restoration looks' shared site. It holds no start, so each look's pack can depend on it and still supply
// exactly one start row.
manifest(
  id='skelly.deadvox.scenario.holdout.restoration',
  tier='scenario', optIn=true,
  content=['restoration'],
  dependencies=['skelly.deadvox.scenario.holdout'],
)
