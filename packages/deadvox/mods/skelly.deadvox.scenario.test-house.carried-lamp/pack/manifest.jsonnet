local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
// The carried-lamp looks' shared sites. It holds no start, so each look's pack can depend on it and still supply
// exactly one start row.
manifest(
  id='skelly.deadvox.scenario.test-house.carried-lamp',
  tier='scenario', optIn=true,
  content=['templates', 'layouts'],
  dependencies=['skelly.building-blocks', 'skelly.deadvox.scenario.test-house'],
)
