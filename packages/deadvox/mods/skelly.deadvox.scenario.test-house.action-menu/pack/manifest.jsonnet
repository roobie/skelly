local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
// A separate start mod selects one loadout without bringing the debug scene's hostile actor into the review.
manifest(
  id='skelly.deadvox.scenario.test-house.action-menu',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.test-house', 'skelly.body', 'skelly.electric-power', 'skelly.flame-tools', 'skelly.materials',
  ]),
)
