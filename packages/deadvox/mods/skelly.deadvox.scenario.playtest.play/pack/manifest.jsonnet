local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Why a scenario is played by picking a pack that names its start: `packages/deadvox/docs/url-mods.md`, "Committed scenarios".
manifest(
  id='skelly.deadvox.scenario.playtest.play',
  tier='scenario',
  defaultStart='playtest',
  optIn=true,
  dependencies=['skelly.deadvox.scenario.playtest'],
)
