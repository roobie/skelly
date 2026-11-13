local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Why a scenario is played by picking a pack that names its start: `packages/deadvox/docs/url-mods.md`, "Committed scenarios".
manifest(
  id='skelly.deadvox.scenario.holdout.play',
  tier='scenario',
  defaultStart='holdout',
  optIn=true,
  dependencies=['skelly.deadvox', 'skelly.deadvox.scenario.holdout'],
  overrides=[{ pack: 'skelly.deadvox', entry: 'defaultStart' }],
)
