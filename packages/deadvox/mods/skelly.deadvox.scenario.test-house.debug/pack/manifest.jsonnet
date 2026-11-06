local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local layout = (import '../../skelly.deadvox.residual/layouts-test-house.jsonnet').layouts[0];
manifest(
  id='skelly.deadvox.scenario.test-house.debug',
  tier='scenario',
  optIn=true,
  content=['layouts', 'catalogue'],
  dependencies=['skelly.deadvox.residual'],
  overrides=[{ pack: 'skelly.deadvox.residual', entry: 'layouts:' + layout.id }],
)
