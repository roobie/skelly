local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// The debug look replaces the Holdout scenario entry with the same site at the shortened wave day. Its one
// start row is a debug fixture, so the pack names no default start; a link reaches it through `start-mod`,
// like the test-house debug starts (`packages/deadvox/docs/url-mods.md`, "Start mod").
manifest(
  id='skelly.deadvox.scenario.holdout.debug',
  tier='scenario',
  optIn=true,
  content=['holdout-debug'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.holdout']),
  overrides=[{ pack: 'skelly.deadvox.scenario.holdout', entry: 'scenarios:holdout' }],
)
