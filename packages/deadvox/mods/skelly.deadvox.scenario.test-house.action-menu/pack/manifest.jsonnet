local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// A separate start mod selects one loadout without bringing the debug scene's hostile actor into the review.
manifest(
  id='skelly.deadvox.scenario.test-house.action-menu',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=[
    'skelly.deadvox.scenario.test-house', 'skelly.basic-recipes', 'skelly.electric-power',
    'skelly.flame-tools', 'skelly.hand-tools', 'skelly.materials', 'skelly.medicine', 'skelly.melee',
    'skelly.packaged-foods', 'skelly.wearables',
  ],
)
