local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The hand-drawn baseline stocks the same supplies as Holdout's stores, so the look depends on their owners as
// Holdout does.
local holdout = import '../../skelly.deadvox.scenario.holdout/pack/manifest.jsonnet';
manifest(
  id='skelly.deadvox.scenario.holdout.stores-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.holdout'] + holdout.dependencies),
)
